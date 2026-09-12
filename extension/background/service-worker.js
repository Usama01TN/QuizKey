/**
 * background/service-worker.js
 * The single orchestrator (MV3 module worker).
 *
 * Responsibilities:
 *   - listen for the configured keyboard commands
 *   - capture the visible tab (quiz source "image") or ask the content
 *     script for a cleaned HTML extract (quiz source "html")
 *   - call the AI client
 *   - persist results per tab
 *   - forward everything to the content script
 *   - surface lifecycle state through the action badge
 */
import { getSettings, setSettings, saveResult, getResult, pruneResults } from "../lib/storage.js";
import {
  analyzeScreenshot,
  analyzePageHtml,
  testConnection,
  listModels,
  hasUsableCredentials,
  originPattern,
  resolveApiStyle,
} from "../lib/ai-client.js";
import { QuizKeyError, ErrorCodes, normalizeError } from "../lib/errors.js";
import { classifyPageAccess, hasFileUrlsPermission } from "../lib/page-access.js";

/** Content bundle in manifest load order; used for on-demand injection. */
const CONTENT_STYLE = ["content/overlay.css"];
const CONTENT_FILES = [
  "content/dom-detector.js",
  "content/page-extractor.js",
  "content/typing-simulator.js",
  "content/overlay.js",
  "content/content-script.js",
];

/** Throw a precise, remedy-carrying error when the page can't be used. */
async function assertPageAccessOk(tab) {
  const filePermission = await hasFileUrlsPermission();
  const access = classifyPageAccess(tab?.url, { filePermission });
  if (!access.ok) {
    const userMessage = access.remedy
      ? `${access.reason} Fix: ${access.remedy}`
      : access.reason;
    throw new QuizKeyError(ErrorCodes.RESTRICTED_PAGE, access.reason, undefined, userMessage);
  }
  return access;
}

/* ------------------------------------------------------------------ */
/* Badge helpers                                                        */
/* ------------------------------------------------------------------ */

const badge = {
  async set(tabId, text, color) {
    try {
      await chrome.action.setBadgeText({ tabId, text });
      if (color) await chrome.action.setBadgeBackgroundColor({ tabId, color });
    } catch (_) { /* tab may be gone */ }
  },
  busy: (tabId) => badge.set(tabId, "…", "#8b8cf8"),
  ok: async (tabId) => {
    await badge.set(tabId, "✓", "#22c55e");
    setTimeout(() => void badge.set(tabId, ""), 2500);
  },
  fail: async (tabId) => {
    await badge.set(tabId, "!", "#ef4444");
    setTimeout(() => void badge.set(tabId, ""), 4000);
  },
};

/* ------------------------------------------------------------------ */
/* Messaging with the content script (with graceful failure)            */
/* ------------------------------------------------------------------ */

/**
 * Inject the content bundle on demand. Needed for tabs that were loaded
 * before the extension was installed/reloaded: their content scripts are
 * missing until refresh, but chrome.scripting can attach them right now.
 */
async function injectContentScripts(tabId) {
  try {
    await chrome.scripting
      .insertCSS({ target: { tabId }, files: CONTENT_STYLE })
      .catch(() => {});
    await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_FILES });
    await new Promise((r) => setTimeout(r, 80)); // let listeners register
    return true;
  } catch (_) {
    return false; // restricted page; the access guard reports the real reason
  }
}

async function sendToTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (firstErr) {
    // Content script missing? Attach it on demand, then retry once.
    if (await injectContentScripts(tabId)) {
      try {
        return await chrome.tabs.sendMessage(tabId, message);
      } catch (_) {
        /* fall through to the normalized original error */
      }
    }
    throw normalizeError(firstErr);
  }
}

/** Best-effort and never throws. Used for progress + error reporting. */
async function notifyTab(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (_) {
    /* restricted page or script not ready; the badge still communicates */
  }
}

/* ------------------------------------------------------------------ */
/* Screenshot preparation                                               */
/* ------------------------------------------------------------------ */

/**
 * Downscale + re-encode the capture in the worker (OffscreenCanvas).
 * A 4K / HiDPI PNG can exceed 10 MB as base64: slow to upload, expensive
 * in vision tokens and rejected by some providers. Quiz text stays perfectly
 * legible at ~1600 px. Falls back to the original on any failure.
 */
async function prepareImage(dataUrl, settings) {
  const maxEdge = Number(settings.maxImageEdge) || 0;
  if (!maxEdge || typeof OffscreenCanvas === "undefined" || typeof createImageBitmap !== "function") {
    return dataUrl;
  }
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const bitmap = await createImageBitmap(blob);
    const longest = Math.max(bitmap.width, bitmap.height);
    const wantJpeg = settings.captureFormat === "jpeg";
    if (longest <= maxEdge && (!wantJpeg || blob.type === "image/jpeg")) {
      bitmap.close?.();
      return dataUrl;
    }
    const scale = Math.min(1, maxEdge / longest);
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (wantJpeg) {
      ctx.fillStyle = "#ffffff"; // JPEG has no alpha, so avoid black backgrounds
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const out = await canvas.convertToBlob(
      wantJpeg
        ? { type: "image/jpeg", quality: settings.jpegQuality ?? 0.85 }
        : { type: "image/png" }
    );
    return await blobToDataUrl(out);
  } catch (err) {
    console.warn("[QuizKey] image downscale skipped:", err);
    return dataUrl;
  }
}

async function blobToDataUrl(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, buf.subarray(i, i + CHUNK));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

/**
 * The manifest grants the hosted presets; anything else was requested at
 * runtime from the options page. Without the grant, CORS decides: many
 * hosted APIs still work, local servers usually don't. We only use this to
 * give a precise remedy if the request then fails.
 */
async function hasEndpointPermission(apiBaseUrl) {
  const pattern = originPattern(apiBaseUrl);
  if (!pattern) return false;
  try {
    return await chrome.permissions.contains({ origins: [pattern] });
  } catch (_) {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Core pipeline                                                        */
/* ------------------------------------------------------------------ */

const SOURCE_LABEL = { image: "Screenshot", html: "Page HTML" };

/** Quiz source "image": screenshot the visible tab → data URL. */
async function captureScreenshot(tab, settings) {
  // Give the page one frame to repaint without our overlay before capturing.
  await new Promise((r) => setTimeout(r, 120));

  const captureOptions =
    settings.captureFormat === "jpeg"
      ? { format: "jpeg", quality: Math.round((settings.jpegQuality ?? 0.85) * 100) }
      : { format: "png" };

  let dataUrl;
  try {
    dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, captureOptions);
  } catch (err) {
    throw new QuizKeyError(ErrorCodes.CAPTURE_FAILED, String(err), err);
  }
  if (!dataUrl) throw new QuizKeyError(ErrorCodes.CAPTURE_FAILED, "Empty capture");
  return prepareImage(dataUrl, settings);
}

/** Quiz source "html": ask the content script for a cleaned DOM extract. */
async function extractPageHtml(tab, settings) {
  let res;
  try {
    res = await sendToTab(tab.id, {
      type: "QUIZKEY_EXTRACT_PAGE",
      options: { maxChars: settings.htmlMaxChars, scope: settings.htmlScope },
    });
  } catch (err) {
    throw new QuizKeyError(ErrorCodes.EXTRACT_FAILED, err?.message || String(err), err);
  }
  if (!res?.ok || !String(res.html || "").trim()) {
    throw new QuizKeyError(ErrorCodes.EXTRACT_FAILED, res?.error || "Empty extract");
  }
  return { html: res.html, meta: res.meta || {} };
}

/**
 * Turn a bare connection failure on an ungranted endpoint into the precise
 * "click Grant access" remedy; it's the #1 cause of silent failures.
 */
async function withPermissionHint(settings, task) {
  try {
    return await task();
  } catch (err) {
    console.warn("[QuizKey] analysis failed:", err?.code, err?.message);
    if (err?.code === ErrorCodes.API_CONNECTION_FAILED && !(await hasEndpointPermission(settings.apiBaseUrl))) {
      throw new QuizKeyError(
        ErrorCodes.PERMISSION_DENIED,
        err.message,
        err,
        `QuizKey has no permission to contact ${originPattern(settings.apiBaseUrl) || "this endpoint"}. ` +
          `Open the QuizKey settings page and click "Grant access" next to the base URL (or "Test connection"), then try again.`
      );
    }
    throw err;
  }
}

/**
 * @param {chrome.tabs.Tab} tab
 * @param {{ source?: "image"|"html" }} [opts] - one-off source override
 *   (the popup passes the switcher value; shortcuts use the saved setting)
 */
async function runCaptureAndAnalyze(tab, { source } = {}) {
  if (!tab?.id) throw new QuizKeyError(ErrorCodes.NO_ACTIVE_TAB);
  await assertPageAccessOk(tab);
  const settings = await getSettings();
  const mode = source === "html" || source === "image" ? source : settings.captureSource === "html" ? "html" : "image";

  if (!hasUsableCredentials(settings)) throw new QuizKeyError(ErrorCodes.API_KEY_MISSING);

  await badge.busy(tab.id);

  // Nothing of ours may be in the capture: hide the overlay + outlines first.
  // (The HTML extractor also skips the overlay root, but a stale answer card
  // on screen would still mislead the *user* while a new run is in flight.)
  await notifyTab(tab.id, { type: "QUIZKEY_HIDE_OVERLAY" });

  const status = (headline, detail) =>
    notifyTab(tab.id, {
      type: "QUIZKEY_SHOW_STATUS",
      headline,
      detail,
      tone: "working",
      position: settings.overlayPosition,
      theme: settings.theme,
    });

  const modelLabel = `${settings.model || "auto model"} · ${resolveApiStyle(settings)} API`;
  let analysis;

  if (mode === "html") {
    await status("Reading page HTML…", "extracting the visible quiz");
    const { html, meta } = await extractPageHtml(tab, settings);
    await status(
      "Analyzing with AI…",
      `${modelLabel} · HTML ${meta.scope || "viewport"} · ${(meta.chars || html.length).toLocaleString()} chars${meta.truncated ? " (truncated)" : ""}`
    );
    analysis = await withPermissionHint(settings, () => analyzePageHtml({ html, meta, settings }));
  } else {
    const dataUrl = await captureScreenshot(tab, settings);
    await status("Analyzing with AI…", `${modelLabel} · screenshot`);
    analysis = await withPermissionHint(settings, () => analyzeScreenshot({ dataUrl, settings }));
  }

  await saveResult(tab.id, analysis);
  await sendToTab(tab.id, { type: "QUIZKEY_ANALYSIS", analysis, settings });
  await badge.ok(tab.id);

  if (settings.autoType) {
    await sendToTab(tab.id, { type: "QUIZKEY_TYPE_ANSWER" });
  }
  return analysis;
}

/** Flip the quiz source (Alt+S) and tell the user which one is active now. */
async function runToggleSource(tab) {
  const settings = await getSettings();
  const next = settings.captureSource === "html" ? "image" : "html";
  await setSettings({ captureSource: next });
  if (tab?.id) {
    await notifyTab(tab.id, {
      type: "QUIZKEY_TOAST",
      text: `Quiz source: ${SOURCE_LABEL[next]}. Press the capture shortcut to analyze.`,
      tone: "info",
      position: settings.overlayPosition,
      theme: settings.theme,
    });
  }
  return { captureSource: next };
}

async function runTypeAnswer(tab) {
  if (!tab?.id) throw new QuizKeyError(ErrorCodes.NO_ACTIVE_TAB);
  await assertPageAccessOk(tab);
  const stored = await getResult(tab.id);
  if (!stored?.analysis) throw new QuizKeyError(ErrorCodes.NO_RESULT);
  const settings = await getSettings();
  await sendToTab(tab.id, {
    type: "QUIZKEY_TYPE_ANSWER",
    analysis: stored.analysis,
    settings,
  });
  return stored.analysis;
}

/** Central guard: every failure becomes a toast + badge, never a crash. */
async function guarded(tab, task) {
  try {
    return await task();
  } catch (err) {
    const normalized = normalizeError(err);
    console.error("[QuizKey]", normalized.code, normalized.message);
    if (tab?.id) {
      await badge.fail(tab.id);
      await notifyTab(tab.id, { type: "QUIZKEY_ERROR", error: normalized.toJSON() });
      // If the content script is unreachable (restricted page), open options
      // when the API key is missing so the user still gets somewhere useful.
      if (
        normalized.code === ErrorCodes.API_KEY_MISSING ||
        normalized.code === ErrorCodes.PERMISSION_DENIED
      ) {
        chrome.runtime.openOptionsPage().catch(() => {});
      }
    }
    return { error: normalized.toJSON() };
  }
}

/* ------------------------------------------------------------------ */
/* Entry points                                                         */
/* ------------------------------------------------------------------ */

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "capture-and-answer") void guarded(tab, () => runCaptureAndAnalyze(tab));
  if (command === "type-answer") void guarded(tab, () => runTypeAnswer(tab));
  if (command === "toggle-quiz-source") void guarded(tab, () => runToggleSource(tab));
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = message?.type === "QUIZKEY_POPUP_ACTION" ? message.tabId : sender?.tab?.id;

  const respond = (promise) => {
    promise.then((payload) => sendResponse(payload ?? { ok: true }));
    return true; // keep the channel open for the async response
  };

  switch (message?.type) {
    case "QUIZKEY_POPUP_STATE":
      return respond(
        (async () => {
          const tab = tabId ? await chrome.tabs.get(tabId).catch(() => null) : null;
          const [settings, stored] = await Promise.all([
            getSettings(),
            tabId ? getResult(tabId) : null,
          ]);
          let reachable = false;
          if (tabId) {
            try {
              await chrome.tabs.sendMessage(tabId, { type: "QUIZKEY_PING" });
              reachable = true;
            } catch (_) {
              reachable = false; // fine, sendToTab injects on demand
            }
          }
          const filePermission = await hasFileUrlsPermission();
          return {
            settings,
            hasApiKey: hasUsableCredentials(settings),
            apiStyle: resolveApiStyle(settings),
            analysis: stored?.analysis || null,
            pageReachable: reachable,
            access: classifyPageAccess(tab?.url, { filePermission }),
          };
        })()
      );

    case "QUIZKEY_POPUP_ACTION":
      return respond(
        (async () => {
          const tab = await chrome.tabs.get(message.tabId).catch(() => null);
          if (!tab) throw new QuizKeyError(ErrorCodes.NO_ACTIVE_TAB);
          if (message.action === "capture") return runCaptureAndAnalyze(tab, { source: message.source });
          if (message.action === "toggle-source") return runToggleSource(tab);
          if (message.action === "type") return runTypeAnswer(tab);
          return { ok: false };
        })().catch((err) => ({ error: normalizeError(err).toJSON() }))
      );

    /* Options-page diagnostics: run through the worker so behaviour is
       identical to a real capture (same permissions, same code path). */
    case "QUIZKEY_TEST_CONNECTION":
      return respond(
        (async () => {
          try {
            const settings = { ...(await getSettings()), ...(message.settings || {}) };
            return { ok: true, message: await testConnection(settings) };
          } catch (err) {
            return { ok: false, error: normalizeError(err).toJSON() };
          }
        })()
      );

    case "QUIZKEY_LIST_MODELS":
      return respond(
        (async () => {
          try {
            const settings = { ...(await getSettings()), ...(message.settings || {}) };
            return { ok: true, models: await listModels(settings) };
          } catch (err) {
            return { ok: false, error: normalizeError(err).toJSON() };
          }
        })()
      );

    case "QUIZKEY_ANALYZE_IMAGE":
      return respond(
        (async () => {
          try {
            const settings = { ...(await getSettings()), ...(message.settings || {}) };
            const dataUrl = await prepareImage(message.dataUrl, settings);
            const analysis = await analyzeScreenshot({ dataUrl, settings });
            return { ok: true, analysis };
          } catch (err) {
            return { ok: false, error: normalizeError(err).toJSON() };
          }
        })()
      );

    case "QUIZKEY_ANALYZE_HTML":
      return respond(
        (async () => {
          try {
            const settings = { ...(await getSettings()), ...(message.settings || {}) };
            const analysis = await analyzePageHtml({ html: message.html, meta: message.meta || {}, settings });
            return { ok: true, analysis };
          } catch (err) {
            return { ok: false, error: normalizeError(err).toJSON() };
          }
        })()
      );

    case "QUIZKEY_LOOKUP_RESULT":
      return respond(
        (async () => {
          if (!tabId) return { analysis: null };
          const stored = await getResult(tabId);
          if (stored?.analysis) {
            const settings = await getSettings();
            await notifyTab(tabId, {
              type: "QUIZKEY_RESTORE_RESULT",
              analysis: stored.analysis,
              settings,
            });
          }
          return { analysis: stored?.analysis || null };
        })()
      );

    default:
      return false;
  }
});

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") chrome.runtime.openOptionsPage().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => void pruneResults().catch(() => {}));
