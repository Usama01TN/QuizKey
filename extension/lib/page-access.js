/**
 * lib/page-access.js
 * Clarifies what Chromium allows for a tab URL and produces a precise
 * diagnosis + remedy for the cases it restricts.
 *
 * The levels:
 *  - captureAllowed: <all_urls> content-script matches include file://, so
 *    QuizKey's content scripts attach automatically on file pages and
 *    tabs.captureVisibleTab renders any allowed tab, including file://.
 *  - scriptAllowed: http(s) pages always work. file:// pages need an
 *    explicit per-extension grant: either the native "Allow access to
 *    file URLs" toggle (chrome://extensions → QuizKey → Details), or
 *    QuizKey's own optional host permission for file:///* requested from
 *    the options page. (Chrome < 136 only shows the native toggle when
 *    the extension declares URL permissions, which is why it may be
 *    missing; the optional-permission button is the fix.)
 *  - isRestricted: the remaining pages where BOTH are blocked for every
 *    extension: browser schemes, extension galleries, other extensions'
 *    pages (incl. the built-in PDF viewer). Not fixable by design.
 */

export const FILE_URLS_PATTERN = "file:///*";

const SYSTEM_SCHEMES = new Set([
  "chrome:",
  "edge:",
  "brave:",
  "opera:",
  "vivaldi:",
  "arc:",
  "about:",
  "devtools:",
  "chrome-extension:",
  "moz-extension:",
  "chrome-search:",
  "chrome-untrusted:",
  "view-source:",
]);

/** Extension galleries: scripting is blocked even over https. */
const STORE_HOSTS = new Set([
  "chromewebstore.google.com",
  "chrome.google.com",
  "microsoftedge.microsoft.com",
  "addons.opera.com",
  "addons.mozilla.org",
]);

/** Native file-URL toggle page for this extension. */
export function extensionDetailsUrl() {
  return `chrome://extensions/?id=${chrome.runtime.id}`;
}

export async function hasFileUrlsPermission() {
  try {
    return await chrome.permissions.contains({ origins: [FILE_URLS_PATTERN] });
  } catch (_) {
    return false;
  }
}

/** Must be called from a user gesture (options page button). */
export async function requestFileUrlsPermission() {
  try {
    return await chrome.permissions.request({ origins: [FILE_URLS_PATTERN] });
  } catch (_) {
    return false;
  }
}

/** @typedef {{ ok: boolean, kind: string, short: string, reason: string,
 *             remedy: string, fixable: boolean, fileAccess: boolean }} PageAccess */

/**
 * @param {string | undefined} rawUrl
 * @param {{ filePermission?: boolean }} [opts] - passed by contexts that
 *   already asked chrome.permissions (options/popup); the background
 *   worker queries live when needed.
 */
export function classifyPageAccess(rawUrl, { filePermission = false } = {}) {
  const url = String(rawUrl || "");

  if (!url) {
    return {
      ok: false,
      kind: "unknown",
      short: "Unknown page",
      reason: "QuizKey can't read this tab's address.",
      remedy: "Reload the tab and try again.",
      fixable: false,
      fileAccess: false,
    };
  }

  // ---- file:// : CAPTURE works out of the box; SCRIPTS need a grant ------
  if (url.startsWith("file:")) {
    return {
      ok: true,
      kind: "file",
      short: "Local file (file://)",
      reason: filePermission
        ? ""
        : "Local files open and capture fine, but typing and the on-page overlay need the browser's file-access switch for QuizKey.",
      remedy: filePermission
        ? ""
        : "Enable it in QuizKey Settings → “Allow access to local files” (this page!), or flip Chrome's native switch: chrome://extensions → QuizKey → Details → “Allow access to file URLs”. Then reload the file.",
      fixable: true,
      fileAccess: filePermission,
    };
  }

  // ---- extension galleries & regular web --------------------------------
  try {
    const u = new URL(url);
    if ((u.protocol === "https:" || u.protocol === "http:") && STORE_HOSTS.has(u.hostname)) {
      return {
        ok: false,
        kind: "store",
        short: "Extension gallery",
        reason:
          "The browser's extension gallery blocks every extension from reading or scripting it.",
        remedy: "Open a regular website and run QuizKey there.",
        fixable: false,
        fileAccess: false,
      };
    }
    if (u.protocol === "http:" || u.protocol === "https:") {
      return { ok: true, kind: "web", short: "Web page", reason: "", remedy: "", fixable: true, fileAccess: true };
    }
  } catch {
    /* fall through to scheme checks */
  }

  // ---- built-in browser schemes (both blocked, by design) ----------------
  const scheme = url.slice(0, url.indexOf(":") + 1);
  if (SYSTEM_SCHEMES.has(scheme)) {
    return {
      ok: false,
      kind: "system",
      short: "Browser system page",
      reason:
        "Built-in browser pages (settings, history, new tab, the PDF viewer and other extensions' pages) cannot be captured or scripted by any extension. That's a Chromium security rule, not a QuizKey bug.",
      remedy: "Switch to a normal http(s) tab and press the shortcut again.",
      fixable: false,
      fileAccess: false,
    };
  }

  // ---- anything else ------------------------------------------------------
  return {
    ok: false,
    kind: "other",
    short: "Restricted page",
    reason: `Pages served over “${scheme}//” can't be captured or scripted by extensions.`,
    remedy: "Open a regular http(s) page.",
    fixable: false,
    fileAccess: false,
  };
}
