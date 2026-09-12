/**
 * options/options.js
 * Settings page logic. ES module; reuses the shared lib modules, persists
 * to chrome.storage immediately on change, requests optional host
 * permission for custom API endpoints, and includes a live replay of the
 * typing cadence.
 */
import {
  getSettings,
  setSettings,
  resetSettings,
  onSettingsChanged,
  DEFAULT_SETTINGS,
} from "../lib/storage.js";
import {
  PROVIDERS,
  getProvider,
  detectProvider,
  resolveApiStyle,
  normalizeBaseUrl,
  isLocalEndpoint,
  originPattern,
  readCallLog,
  clearCallLog,
} from "../lib/ai-client.js";
import { toUserMessage } from "../lib/errors.js";
import { initTheme } from "../lib/theme.js";
import {
  hasFileUrlsPermission,
  requestFileUrlsPermission,
  extensionDetailsUrl,
} from "../lib/page-access.js";

const $ = (sel) => document.querySelector(sel);

const els = {
  saveState: $("#save-state"),
  btnReset: $("#btn-reset"),
  providerPreset: $("#providerPreset"),
  providerNote: $("#provider-note"),
  apiBaseUrl: $("#apiBaseUrl"),
  btnGrant: $("#btn-grant"),
  grantState: $("#grant-state"),
  apiKey: $("#apiKey"),
  keyHint: $("#key-hint"),
  keyLink: $("#key-link"),
  btnToggleKey: $("#btn-toggle-key"),
  apiStyle: $("#apiStyle"),
  styleDetected: $("#style-detected"),
  model: $("#model"),
  modelHint: $("#model-hint"),
  modelList: $("#model-list"),
  btnModels: $("#btn-models"),
  modelsState: $("#models-state"),
  maxOutputTokens: $("#maxOutputTokens"),
  maxImageEdge: $("#maxImageEdge"),
  extraInstructions: $("#extraInstructions"),
  btnTest: $("#btn-test"),
  btnDiagnose: $("#btn-diagnose"),
  testResult: $("#test-result"),
  logBody: $("#log-body"),
  logCount: $("#log-count"),
  btnLogClear: $("#btn-log-clear"),
  sourceSwitch: $("#source-switch"),
  htmlScope: $("#htmlScope"),
  htmlMaxChars: $("#htmlMaxChars"),
  htmlOptions: $("#html-options"),
  toggleKey: $("#toggle-key"),
  captureFormat: $("#captureFormat"),
  jpegQuality: $("#jpegQuality"),
  jpegQualityOut: $("#jpegQualityOut"),
  typingDelayMs: $("#typingDelayMs"),
  typingDelayOut: $("#typingDelayOut"),
  typingJitterMs: $("#typingJitterMs"),
  typingJitterOut: $("#typingJitterOut"),
  previewField: $("#preview-field"),
  btnPreview: $("#btn-preview"),
  autoType: $("#autoType"),
  clickChoice: $("#clickChoice"),
  highlightMatches: $("#highlightMatches"),
  overlayPosition: $("#overlayPosition"),
  shortcutEditor: $("#shortcut-editor"),
  btnFileAccess: $("#btn-file-access"),
  btnTheme: $("#btn-theme"),
  theme: $("#theme"),
  fileAccessState: $("#file-access-state"),
};

const COMMAND_LABELS = {
  "capture-and-answer": "Capture & analyze",
  "type-answer": "Type answer",
  "toggle-quiz-source": "Switch quiz source (Image ↔ HTML)",
};

/* ------------------------------------------------------------------ */
/* Quiz source switcher                                                */
/* ------------------------------------------------------------------ */

/** @type {"image"|"html"} */
let captureSource = "image";

function renderSource(source) {
  captureSource = source === "html" ? "html" : "image";
  for (const btn of els.sourceSwitch.querySelectorAll(".seg-btn")) {
    const on = btn.dataset.source === captureSource;
    btn.setAttribute("aria-checked", String(on));
    btn.tabIndex = on ? 0 : -1;
  }
  els.htmlOptions.style.opacity = captureSource === "html" ? "" : "0.55";
  els.modelHint.textContent =
    captureSource === "html" ? "(any chat model, vision not required)" : "(must accept image input)";
}

async function chooseSource(source) {
  if (source === captureSource) return;
  renderSource(source);
  await persist({ captureSource: source });
}

/* Provider presets come from lib/providers.js: one verified list shared
   with the worker, the popup and the README. */
function populateProviderSelect() {
  els.providerPreset.innerHTML = "";
  for (const p of PROVIDERS) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.label;
    els.providerPreset.appendChild(opt);
  }
}

function link(href, text) {
  const a = document.createElement("a");
  a.href = href;
  a.textContent = text;
  a.target = "_blank";
  a.rel = "noreferrer";
  return a;
}

/* ------------------------------------------------------------------ */
/* Load + persist                                                      */
/* ------------------------------------------------------------------ */

let saveTimer = null;

function markSaved() {
  els.saveState.textContent = "All changes saved";
  els.saveState.className = "save-state saved";
}

async function persist(patch) {
  els.saveState.textContent = "Saving…";
  els.saveState.className = "save-state dirty";
  clearTimeout(saveTimer);
  await setSettings(patch);
  saveTimer = setTimeout(markSaved, 350);
}

/* Debounced variant for slider drags: chrome.storage has a write quota
   (MAX_WRITE_OPERATIONS_PER_MINUTE), so continuous input events batch up. */
let writeTimer = null;
function persistLater(patch, ms = 220) {
  els.saveState.textContent = "Saving…";
  els.saveState.className = "save-state dirty";
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    void setSettings(patch).then(markSaved);
  }, ms);
}

async function hydrate() {
  const s = await getSettings();
  els.apiBaseUrl.value = s.apiBaseUrl;
  els.apiKey.value = s.apiKey;
  els.apiStyle.value = s.apiStyle || "auto";
  els.model.value = s.model;
  els.maxOutputTokens.value = s.maxOutputTokens;
  els.maxImageEdge.value = s.maxImageEdge;
  els.extraInstructions.value = s.extraInstructions;
  renderSource(s.captureSource);
  els.htmlScope.value = s.htmlScope || "viewport";
  els.htmlMaxChars.value = s.htmlMaxChars;
  els.captureFormat.value = s.captureFormat;
  els.jpegQuality.value = Math.round(s.jpegQuality * 100);
  els.typingDelayMs.value = s.typingDelayMs;
  els.typingJitterMs.value = s.typingJitterMs;
  els.autoType.checked = s.autoType;
  els.clickChoice.checked = s.clickChoice;
  els.highlightMatches.checked = s.highlightMatches;
  els.overlayPosition.value = s.overlayPosition;
  els.theme.value = s.theme || "auto";
  syncOutputs();
  detectPreset(s.provider || "custom");
  syncKeyHint();
  void refreshGrantState();
}

/** Local servers don't need a key, so say so instead of demanding one. */
function syncKeyHint() {
  const local = isLocalEndpoint(els.apiBaseUrl.value);
  const p = getProvider(els.providerPreset.value);
  els.keyHint.textContent = local ? "(optional for local servers)" : "(required)";
  els.apiKey.placeholder = local
    ? p.id === "omniroute" ? "key from OmniRoute Dashboard → Endpoints" : "leave empty unless your server needs one"
    : p.id === "anthropic" ? "sk-ant-…" : p.id.startsWith("gemini") ? "AIza…" : "sk-…";
}

/** Reflect the current endpoint back onto the preset dropdown + hints. */
function detectPreset(fallbackId = "custom") {
  const hit = detectProvider(els.apiBaseUrl.value);
  els.providerPreset.value = hit ? hit.id : fallbackId;
  renderProviderNote(getProvider(els.providerPreset.value));
  syncStyleHint();
}

function renderProviderNote(p) {
  els.providerNote.innerHTML = "";
  if (!p) return;
  els.providerNote.append(p.note || "");
  if (p.docsUrl) els.providerNote.append(" ", link(p.docsUrl, "Docs"));
  els.keyLink.innerHTML = "";
  if (p.keyUrl && p.needsKey) els.keyLink.append("Get a key: ", link(p.keyUrl, p.keyUrl.replace(/^https?:\/\//, "")));
  if (p.altModels?.length) {
    els.modelList.innerHTML = "";
    for (const m of [p.model, ...p.altModels].filter(Boolean)) {
      const o = document.createElement("option");
      o.value = m;
      els.modelList.appendChild(o);
    }
  }
}

function syncStyleHint() {
  const style = resolveApiStyle({ apiStyle: els.apiStyle.value, apiBaseUrl: els.apiBaseUrl.value });
  const auto = els.apiStyle.value === "auto";
  const names = { openai: "OpenAI Chat Completions", gemini: "Google Gemini native", anthropic: "Anthropic Messages" };
  els.styleDetected.textContent = auto ? `Detected: ${names[style] || style}` : `Pinned: ${names[style] || style}`;
}

function syncOutputs() {
  els.jpegQualityOut.textContent = `${els.jpegQuality.value}%`;
  els.typingDelayOut.textContent = `${els.typingDelayMs.value} ms`;
  els.typingJitterOut.textContent = `${els.typingJitterMs.value} ms`;
}

function currentSnapshot() {
  return {
    provider: els.providerPreset.value,
    apiStyle: els.apiStyle.value,
    apiBaseUrl: normalizeBaseUrl(els.apiBaseUrl.value),
    apiKey: els.apiKey.value.trim(),
    model: els.model.value.trim(),
    maxOutputTokens: Number(els.maxOutputTokens.value) || DEFAULT_SETTINGS.maxOutputTokens,
    maxImageEdge: Math.max(0, Number(els.maxImageEdge.value) || 0),
    requestTimeoutMs: DEFAULT_SETTINGS.requestTimeoutMs,
    extraInstructions: els.extraInstructions.value,
    captureSource,
    htmlScope: els.htmlScope.value,
    htmlMaxChars: Math.max(1000, Number(els.htmlMaxChars.value) || DEFAULT_SETTINGS.htmlMaxChars),
    captureFormat: els.captureFormat.value,
    jpegQuality: Number(els.jpegQuality.value) / 100,
    typingDelayMs: Number(els.typingDelayMs.value),
    typingJitterMs: Number(els.typingJitterMs.value),
    autoType: els.autoType.checked,
    clickChoice: els.clickChoice.checked,
    highlightMatches: els.highlightMatches.checked,
    overlayPosition: els.overlayPosition.value,
    theme: els.theme.value,
  };
}

/* ------------------------------------------------------------------ */
/* Optional host permission for custom endpoints                       */
/* ------------------------------------------------------------------ */

/**
 * The manifest grants OpenAI, Gemini and OpenRouter. Every other origin
 * (OmniRoute, LM Studio, Ollama, Azure, a proxy…) must be granted at
 * runtime. Without it the background fetch is at the mercy of CORS, which
 * local servers usually block: the #1 reason "nothing happens" on capture.
 *
 * chrome.permissions.request() needs a user gesture, so we call it from
 * the change events of the URL/preset controls and from the buttons.
 */
async function hasEndpointPermission() {
  const pattern = originPattern(els.apiBaseUrl.value);
  if (!pattern) return false;
  try {
    return await chrome.permissions.contains({ origins: [pattern] });
  } catch (_) {
    return false;
  }
}

async function ensureEndpointPermission() {
  const pattern = originPattern(els.apiBaseUrl.value);
  if (!pattern) return false;
  try {
    if (await chrome.permissions.contains({ origins: [pattern] })) return true;
    return await chrome.permissions.request({ origins: [pattern] });
  } catch (_) {
    return false;
  } finally {
    void refreshGrantState();
  }
}

async function refreshGrantState() {
  const pattern = originPattern(els.apiBaseUrl.value);
  if (!pattern) {
    els.grantState.textContent = "";
    els.btnGrant.disabled = true;
    return;
  }
  const granted = await hasEndpointPermission();
  els.btnGrant.disabled = granted;
  els.btnGrant.textContent = granted ? "Access granted" : "Grant access";
  els.grantState.textContent = granted
    ? ""
    : `QuizKey needs permission to contact ${pattern.replace(/\/\*$/, "")}. Click "Grant access".`;
  els.grantState.className = granted ? "test-result ok" : "test-result err";
}

els.btnGrant.addEventListener("click", async () => {
  const ok = await ensureEndpointPermission();
  if (!ok) {
    els.grantState.textContent = "Permission was not granted. Capture will likely fail on this endpoint.";
    els.grantState.className = "test-result err";
  }
});

chrome.permissions?.onAdded?.addListener(() => void refreshGrantState());
chrome.permissions?.onRemoved?.addListener(() => void refreshGrantState());

/* ------------------------------------------------------------------ */
/* Test connection · Load models · Diagnostic · Call log               */
/* ------------------------------------------------------------------ */

/** Everything runs through the worker so it behaves exactly like a capture. */
function askWorker(type, extra = {}) {
  return chrome.runtime.sendMessage({ type, settings: currentSnapshot(), ...extra });
}

function setResult(text, tone) {
  els.testResult.textContent = text;
  els.testResult.className = `test-result ${tone || ""}`.trim();
}

async function prepareForCall() {
  const normalized = normalizeBaseUrl(els.apiBaseUrl.value);
  if (normalized && normalized !== els.apiBaseUrl.value.trim()) {
    els.apiBaseUrl.value = normalized;
    detectPreset();
    syncKeyHint();
  }
  await persist(currentSnapshot());
  const granted = await ensureEndpointPermission();
  if (!granted) {
    setResult("Host permission was not granted; the request may be blocked by CORS. Trying anyway…", "err");
  }
}

els.btnTest.addEventListener("click", async () => {
  setResult("Checking…");
  els.btnTest.disabled = true;
  try {
    await prepareForCall();
    const res = await askWorker("QUIZKEY_TEST_CONNECTION");
    if (res?.ok) setResult(res.message, "ok");
    else setResult(res?.error?.userMessage || "Test failed.", "err");
  } catch (err) {
    setResult(toUserMessage(err), "err");
  } finally {
    els.btnTest.disabled = false;
    void refreshLog();
  }
});

els.btnModels.addEventListener("click", async () => {
  els.modelsState.textContent = "Loading…";
  els.btnModels.disabled = true;
  try {
    await prepareForCall();
    const res = await askWorker("QUIZKEY_LIST_MODELS");
    if (!res?.ok) {
      els.modelsState.textContent = res?.error?.userMessage || "Could not list models.";
      return;
    }
    const models = res.models || [];
    els.modelList.innerHTML = "";
    for (const m of models) {
      const o = document.createElement("option");
      o.value = m;
      els.modelList.appendChild(o);
    }
    const current = els.model.value.trim();
    els.modelsState.textContent = models.length
      ? `${models.length} model${models.length === 1 ? "" : "s"} available. Start typing in the Model box to pick one.` +
        (current && !models.includes(current) ? ` Note: "${current}" is not among them.` : "")
      : "The provider returned an empty model list.";
    if (!current && models.length) {
      els.model.value = models[0];
      void persist({ model: models[0] });
    }
  } catch (err) {
    els.modelsState.textContent = toUserMessage(err);
  } finally {
    els.btnModels.disabled = false;
    void refreshLog();
  }
});

/** A synthetic quiz screenshot so the pipeline can be tested without a tab. */
function sampleQuizImage() {
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 520;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#111827";
  ctx.font = "bold 30px Arial";
  ctx.fillText("Geography Quiz: Question 3 of 10", 40, 70);
  ctx.font = "26px Arial";
  ctx.fillText("What is the capital city of France?", 40, 140);
  ctx.font = "24px Arial";
  const opts = ["A. Rome", "B. Paris", "C. Madrid", "D. Berlin"];
  opts.forEach((t, i) => {
    ctx.strokeStyle = "#9ca3af";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(60, 200 + i * 56, 11, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillText(t, 90, 208 + i * 56);
  });
  ctx.strokeStyle = "#6b7280";
  ctx.strokeRect(40, 440, 520, 48);
  ctx.fillStyle = "#9ca3af";
  ctx.font = "20px Arial";
  ctx.fillText("Type your answer here…", 52, 471);
  return canvas.toDataURL("image/jpeg", 0.9);
}

/** The same sample quiz as a cleaned HTML extract (what page-extractor.js emits). */
function sampleQuizHtml() {
  return [
    "<h2>Geography Quiz: Question 3 of 10</h2>",
    "<p>What is the capital city of France?</p>",
    "<ul>",
    '<li><label><input type="radio" name="q3" value="a"> A. Rome</label></li>',
    '<li><label><input type="radio" name="q3" value="b"> B. Paris</label></li>',
    '<li><label><input type="radio" name="q3" value="c"> C. Madrid</label></li>',
    '<li><label><input type="radio" name="q3" value="d"> D. Berlin</label></li>',
    "</ul>",
    '<input type="text" name="answer" placeholder="Type your answer here…">',
    '<button type="submit">Submit</button>',
  ].join("\n");
}

els.btnDiagnose.addEventListener("click", async () => {
  const viaHtml = captureSource === "html";
  setResult(`Running the sample quiz (${viaHtml ? "HTML" : "image"} source) through the analysis pipeline…`);
  els.btnDiagnose.disabled = true;
  try {
    await prepareForCall();
    const res = viaHtml
      ? await askWorker("QUIZKEY_ANALYZE_HTML", {
          html: sampleQuizHtml(),
          meta: { title: "Geography Quiz", url: "https://example.test/quiz/3", scope: "viewport" },
        })
      : await askWorker("QUIZKEY_ANALYZE_IMAGE", { dataUrl: sampleQuizImage() });
    if (res?.ok) {
      const a = res.analysis;
      const best = a.inputKind === "choice"
        ? `${a.correctAnswerId ?? ""}. ${a.answers?.find((x) => x.id === a.correctAnswerId)?.text || a.answerText || ""}`.trim()
        : a.answerText;
      const verdict = /paris/i.test(best || "") ? "✓ Pipeline works." : "⚠ Pipeline works but the model answered unexpectedly:";
      setResult(
        `${verdict}\nModel: ${a.model} (${a.apiStyle} API · ${a.source || (viaHtml ? "html" : "image")} source)\nQuestion read: ${a.question || "(none)"}\nAnswer: ${best || "(none)"} (${Math.round((a.confidence || 0) * 100)}% confident)` +
          (a.explanation ? `\n${a.explanation}` : ""),
        "ok"
      );
    } else {
      setResult(`✗ ${res?.error?.userMessage || "Diagnostic failed."}\n(${res?.error?.code || "?"}) ${res?.error?.message || ""}`.trim(), "err");
    }
  } catch (err) {
    setResult(toUserMessage(err), "err");
  } finally {
    els.btnDiagnose.disabled = false;
    void refreshLog();
  }
});

async function refreshLog() {
  const entries = await readCallLog();
  els.logCount.textContent = entries.length ? `(${entries.length})` : "";
  if (!entries.length) {
    els.logBody.textContent = "No calls yet.";
    return;
  }
  els.logBody.textContent = entries
    .slice()
    .reverse()
    .map((e) => {
      const t = new Date(e.at).toLocaleTimeString();
      return `${t}  ${e.label || "call"}  ${e.method} ${e.url}\n        → ${e.status}${e.ms != null ? ` in ${e.ms} ms` : ""}${e.error ? `  ${e.error}` : ""}`;
    })
    .join("\n");
}

els.btnLogClear.addEventListener("click", async () => {
  await clearCallLog();
  void refreshLog();
});

/* ------------------------------------------------------------------ */
/* Live typing preview (mirrors the content-script cadence)            */
/* ------------------------------------------------------------------ */

const PREVIEW_TEXT = "Saturn";

let previewTimer = null;

function runPreview() {
  clearTimeout(previewTimer);
  els.previewField.value = "";
  const delay = Number(els.typingDelayMs.value);
  const jitter = Number(els.typingJitterMs.value);
  let i = 0;
  const step = () => {
    if (i >= PREVIEW_TEXT.length) return;
    els.previewField.value += PREVIEW_TEXT[i];
    els.previewField.dispatchEvent(new Event("input", { bubbles: true }));
    let d = delay + Math.floor(Math.random() * (jitter + 1));
    if (PREVIEW_TEXT[i] === " ") d *= 1.6;
    i += 1;
    previewTimer = setTimeout(step, Math.round(d));
  };
  previewTimer = setTimeout(step, 250);
}

els.btnPreview.addEventListener("click", runPreview);

/* ------------------------------------------------------------------ */
/* Local file (file://) access                                          */
/* ------------------------------------------------------------------ */

async function refreshFileAccess() {
  const granted = await hasFileUrlsPermission();
  els.fileAccessState.textContent = granted
    ? "Enabled. Typing and overlay work on open local files."
    : "Not enabled. Capture works on local files; typing and overlay need this.";
  els.fileAccessState.className = granted ? "test-result ok" : "test-result";
  els.btnFileAccess.disabled = granted;
  els.btnFileAccess.textContent = granted ? "File access enabled" : "Enable file access";
}

els.btnFileAccess.addEventListener("click", async () => {
  els.btnFileAccess.disabled = true;
  els.fileAccessState.textContent = "Requesting…";
  els.fileAccessState.className = "test-result";

  const granted = await requestFileUrlsPermission();
  if (granted) {
    await refreshFileAccess();
    // Also nudge Chrome to pick up scripting on any already-open file tabs.
    const files = await chrome.tabs.query({ url: "file:///*" }).catch(() => []);
    for (const tab of files) {
      chrome.tabs.reload(tab.id).catch(() => {});
    }
    if (files.length) {
      els.fileAccessState.textContent += ` Reloaded ${files.length} open file tab${files.length > 1 ? "s" : ""}.`;
    }
    return;
  }

  els.fileAccessState.innerHTML = "";
  els.fileAccessState.append(
    "Request was dismissed. You can also enable Chrome's native switch on the ",
  );
  const link = document.createElement("a");
  link.href = extensionDetailsUrl();
  link.textContent = "QuizKey details page";
  link.target = "_blank";
  link.rel = "noreferrer";
  link.style.color = "inherit";
  link.style.textDecoration = "underline";
  els.fileAccessState.append(link, ".");
  els.fileAccessState.className = "test-result err";
  els.btnFileAccess.disabled = false;
  els.btnFileAccess.textContent = "Enable file access";
});

chrome.permissions?.onAdded?.addListener(() => void refreshFileAccess());
chrome.permissions?.onRemoved?.addListener(() => void refreshFileAccess());
void refreshFileAccess();

/* ------------------------------------------------------------------ */
/* Shortcut editor                                                     */
/* ------------------------------------------------------------------ */

const MODIFIERS = new Set(["Alt", "Control", "Shift", "Meta"]);

function comboFromEvent(e) {
  const parts = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.metaKey) parts.push("MacCtrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (MODIFIERS.has(e.key)) return null; // modifier-only press
  let key = e.key;
  if (key === " ") key = "Space";
  if (key.length === 1) key = key.toUpperCase();
  parts.push(key);
  return parts.join("+");
}

async function renderShortcutEditor() {
  const commands = await chrome.commands.getAll().catch(() => []);
  els.shortcutEditor.innerHTML = "";
  const canUpdate = typeof chrome.commands.update === "function";

  const toggleCmd = commands.find((c) => c.name === "toggle-quiz-source");
  if (els.toggleKey) els.toggleKey.textContent = toggleCmd?.shortcut || "Not set";

  for (const cmd of commands.filter((c) => COMMAND_LABELS[c.name])) {
    const row = document.createElement("div");
    row.className = "shortcut-edit-row";
    const label = document.createElement("span");
    label.textContent = COMMAND_LABELS[cmd.name];
    const key = document.createElement("kbd");
    key.tabIndex = 0;
    key.textContent = cmd.shortcut || "Click to record";

    key.addEventListener("click", () => {
      key.classList.add("recording");
      key.textContent = "Press keys…";
      key.focus();
    });
    key.addEventListener("blur", () => {
      key.classList.remove("recording");
      key.textContent = cmd.shortcut || "Click to record";
    });
    key.addEventListener("keydown", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        key.blur();
        return;
      }
      const combo = comboFromEvent(e);
      if (!combo) return;

      if (canUpdate) {
        try {
          await chrome.commands.update({ name: cmd.name, shortcut: combo });
          cmd.shortcut = combo;
          key.textContent = combo;
        } catch (err) {
          key.textContent = "Rejected";
          setTimeout(() => (key.textContent = cmd.shortcut || "Click to record"), 1200);
        }
      } else {
        key.textContent = "Use chrome://extensions/shortcuts";
        setTimeout(() => (key.textContent = cmd.shortcut || "Click to record"), 1600);
      }
      key.classList.remove("recording");
      key.blur();
    });

    row.append(label, key);
    els.shortcutEditor.appendChild(row);
  }
}

/* ------------------------------------------------------------------ */
/* Wire up form events                                                 */
/* ------------------------------------------------------------------ */

function bind() {
  els.providerPreset.addEventListener("change", () => {
    const p = getProvider(els.providerPreset.value);
    renderProviderNote(p);
    if (p.id !== "custom") {
      els.apiBaseUrl.value = p.baseUrl;
      els.model.value = p.model;
    }
    els.apiStyle.value = "auto";
    syncKeyHint();
    syncStyleHint();
    setResult("");
    els.modelsState.textContent = "";
    void persist({ provider: p.id, apiBaseUrl: els.apiBaseUrl.value, model: els.model.value, apiStyle: "auto" });
    void ensureEndpointPermission(); // change event carries the user gesture
  });

  els.apiBaseUrl.addEventListener("change", () => {
    const normalized = normalizeBaseUrl(els.apiBaseUrl.value);
    if (normalized) els.apiBaseUrl.value = normalized;
    detectPreset();
    syncKeyHint();
    setResult("");
    void persist({ apiBaseUrl: normalized, provider: els.providerPreset.value });
    void ensureEndpointPermission();
  });

  els.apiStyle.addEventListener("change", () => {
    syncStyleHint();
    void persist({ apiStyle: els.apiStyle.value });
  });
  els.maxOutputTokens.addEventListener("change", () => {
    void persist({ maxOutputTokens: Number(els.maxOutputTokens.value) || DEFAULT_SETTINGS.maxOutputTokens });
  });
  els.maxImageEdge.addEventListener("change", () => {
    void persist({ maxImageEdge: Math.max(0, Number(els.maxImageEdge.value) || 0) });
  });

  els.apiKey.addEventListener("change", () => void persist({ apiKey: els.apiKey.value.trim() }));
  els.model.addEventListener("change", () => {
    void persist({ model: els.model.value.trim() }); // empty = "first served model" on local servers
  });
  els.extraInstructions.addEventListener("change", () => void persist({ extraInstructions: els.extraInstructions.value }));

  els.btnToggleKey.addEventListener("click", () => {
    const showing = els.apiKey.type === "text";
    els.apiKey.type = showing ? "password" : "text";
    els.btnToggleKey.textContent = showing ? "Show" : "Hide";
  });

  els.sourceSwitch.addEventListener("click", (e) => {
    const btn = e.target.closest?.(".seg-btn");
    if (btn?.dataset.source) void chooseSource(btn.dataset.source);
  });
  els.sourceSwitch.addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const next = captureSource === "image" ? "html" : "image";
    void chooseSource(next);
    els.sourceSwitch.querySelector(`[data-source="${next}"]`)?.focus();
  });
  // Flipped from the popup or Alt+S while this page is open → mirror it.
  onSettingsChanged((settings) => {
    if (settings?.captureSource && settings.captureSource !== captureSource) renderSource(settings.captureSource);
  });
  els.htmlScope.addEventListener("change", () => void persist({ htmlScope: els.htmlScope.value }));
  els.htmlMaxChars.addEventListener("change", () => {
    const v = Math.max(1000, Number(els.htmlMaxChars.value) || DEFAULT_SETTINGS.htmlMaxChars);
    els.htmlMaxChars.value = v;
    void persist({ htmlMaxChars: v });
  });

  els.captureFormat.addEventListener("change", () => void persist({ captureFormat: els.captureFormat.value }));

  els.jpegQuality.addEventListener("input", () => {
    syncOutputs();
    persistLater({ jpegQuality: Number(els.jpegQuality.value) / 100 });
  });
  els.typingDelayMs.addEventListener("input", () => {
    syncOutputs();
    persistLater({ typingDelayMs: Number(els.typingDelayMs.value) });
  });
  els.typingJitterMs.addEventListener("input", () => {
    syncOutputs();
    persistLater({ typingJitterMs: Number(els.typingJitterMs.value) });
  });

  els.autoType.addEventListener("change", () => void persist({ autoType: els.autoType.checked }));
  els.clickChoice.addEventListener("change", () => void persist({ clickChoice: els.clickChoice.checked }));
  els.highlightMatches.addEventListener("change", () => void persist({ highlightMatches: els.highlightMatches.checked }));
  els.overlayPosition.addEventListener("change", () => void persist({ overlayPosition: els.overlayPosition.value }));
  els.theme.addEventListener("change", () => void themeCtl?.set(els.theme.value));

  els.btnReset.addEventListener("click", async () => {
    await resetSettings();
    await hydrate();
    markSaved();
  });
}

let themeCtl = null;
void initTheme({
  toggle: els.btnTheme,
  onChange: (mode) => {
    if (els.theme.value !== mode) els.theme.value = mode; // header toggle ↔ select stay in sync
  },
}).then((ctl) => {
  themeCtl = ctl;
});

populateProviderSelect();
void hydrate().then(refreshLog);
void renderShortcutEditor();
bind();
markSaved();
setTimeout(runPreview, 600); // greet the user with the cadence once
