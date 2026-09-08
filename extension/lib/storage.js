/**
 * lib/storage.js
 * Single source of truth for settings + per-tab analysis results.
 * Everything lives in chrome.storage.local — nothing is synced or sent
 * anywhere except to the configured AI endpoint.
 */

/** @typedef {Object} QuizKeySettings
 * @property {string}  provider          Preset id from lib/providers.js ("openai", "gemini", …, "custom")
 * @property {"auto"|"openai"|"gemini"|"anthropic"} apiStyle  API dialect; "auto" infers it from the URL
 * @property {string}  apiBaseUrl        Provider base URL (no trailing slash)
 * @property {string}  apiKey            API key — stored locally only
 * @property {string}  model             Vision-capable model name
 * @property {number}  requestTimeoutMs  Abort threshold for AI requests (reasoning models are slow)
 * @property {number}  maxOutputTokens   Completion budget — must be large for reasoning models
 * @property {number}  maxImageEdge      Screenshot is downscaled so its longest edge ≤ this (0 = off)
 * @property {"png"|"jpeg"} captureFormat
 * @property {number}  jpegQuality       0.1 – 1.0 (ignored for png)
 * @property {number}  typingDelayMs     Base delay between keystrokes
 * @property {number}  typingJitterMs    Random 0..n ms added per keystroke
 * @property {boolean} autoType          Type automatically after analysis
 * @property {boolean} highlightMatches  Outline detected question/answer nodes
 * @property {boolean} clickChoice       Click detected choice answers
 * @property {string}  extraInstructions Free-form prompt suffix
 * @property {"top-right"|"top-left"|"bottom-right"|"bottom-left"} overlayPosition
 * @property {"auto"|"dark"|"light"} theme  Appearance of the options page, popup and overlay
 */

/** @type {QuizKeySettings} */
export const DEFAULT_SETTINGS = Object.freeze({
  provider: "openai",
  apiStyle: "auto",
  apiBaseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
  requestTimeoutMs: 90000,
  maxOutputTokens: 4096,
  maxImageEdge: 1600,
  captureFormat: "jpeg",
  jpegQuality: 0.85,
  typingDelayMs: 60,
  typingJitterMs: 45,
  autoType: false,
  highlightMatches: true,
  clickChoice: true,
  extraInstructions: "",
  overlayPosition: "top-right",
  theme: "auto",
});

const SETTINGS_KEY = "quizkey.settings";
const resultKey = (tabId) => `quizkey.result.${tabId}`;

/** @returns {Promise<QuizKeySettings>} */
export async function getSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(stored[SETTINGS_KEY] || {}) };
}

/** @param {Partial<QuizKeySettings>} patch */
export async function setSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

export async function resetSettings() {
  await chrome.storage.local.set({ [SETTINGS_KEY]: { ...DEFAULT_SETTINGS } });
  return { ...DEFAULT_SETTINGS };
}

/**
 * @param {(settings: QuizKeySettings, changes: object) => void} callback
 */
export function onSettingsChanged(callback) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[SETTINGS_KEY]) {
      callback(changes[SETTINGS_KEY].newValue, changes);
    }
  });
}

/* ------------------------------------------------------------------ */
/* Per-tab analysis results                                            */
/* ------------------------------------------------------------------ */

/** @param {number} tabId @param {object} analysis */
export async function saveResult(tabId, analysis) {
  await chrome.storage.local.set({
    [resultKey(tabId)]: { analysis, savedAt: Date.now() },
  });
}

/** @returns {Promise<{analysis: object, savedAt: number} | null>} */
export async function getResult(tabId) {
  const stored = await chrome.storage.local.get(resultKey(tabId));
  return stored[resultKey(tabId)] || null;
}

/** @param {number} tabId */
export async function clearResult(tabId) {
  await chrome.storage.local.remove(resultKey(tabId));
}

/** Tidy up results for tabs that no longer exist. */
export async function pruneResults() {
  const [all, tabs] = await Promise.all([
    chrome.storage.local.get(null),
    chrome.tabs.query({}),
  ]);
  const alive = new Set(tabs.map((t) => t.id));
  const stale = Object.keys(all)
    .filter((k) => k.startsWith("quizkey.result."))
    .filter((k) => !alive.has(Number(k.split(".").pop())));
  if (stale.length) await chrome.storage.local.remove(stale);
}
