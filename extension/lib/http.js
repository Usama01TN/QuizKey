/**
 * lib/http.js
 * Transport helpers shared by every provider adapter: URL normalization,
 * timeouts, MV3 keep-alive, provider error extraction and a small
 * "last call" log that the options page shows for debugging.
 */

import { QuizKeyError, ErrorCodes } from "./errors.js";

export const DEFAULT_TIMEOUT_MS = 90000;

/* ------------------------------------------------------------------ */
/* URLs                                                                 */
/* ------------------------------------------------------------------ */

function isLocalHostname(host) {
  const h = String(host || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!h) return false;
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) return true;
  if (h === "::1" || h === "0.0.0.0") return true;
  if (/^127\.\d+\.\d+\.\d+$/.test(h)) return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(h)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(h)) return true;
  return false;
}

/**
 * Normalize a base URL the way a forgiving human would expect:
 *   - trims, adds a scheme (http for local hosts, https otherwise)
 *   - strips trailing slashes
 *   - strips an accidentally pasted endpoint suffix
 *     ("/chat/completions", "/messages", "/models", ":generateContent"…)
 * The result never ends with "/".
 */
export function normalizeBaseUrl(url) {
  let s = String(url || "").trim();
  if (!s) return "";
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    s = (isLocalHostname(s.split(/[/:?#]/)[0]) ? "http://" : "https://") + s;
  }
  s = s.replace(/[?#].*$/, ""); // query strings belong to Azure only; handled by the adapter
  s = s.replace(/\/+$/, "");
  s = s.replace(/\/models\/[^/]+:(generateContent|streamGenerateContent)$/i, "");
  s = s.replace(/\/(chat\/completions|completions|messages|models|responses)$/i, "");
  return s.replace(/\/+$/, "");
}

export function isLocalEndpoint(url) {
  try {
    return isLocalHostname(new URL(normalizeBaseUrl(url)).hostname);
  } catch (_) {
    return false;
  }
}

/** "https://host/*": the shape chrome.permissions wants. */
export function originPattern(url) {
  try {
    return `${new URL(normalizeBaseUrl(url)).origin}/*`;
  } catch (_) {
    return null;
  }
}

export function hostOf(url) {
  try {
    return new URL(normalizeBaseUrl(url)).hostname.toLowerCase();
  } catch (_) {
    return "";
  }
}

export function pathOf(url) {
  try {
    return new URL(normalizeBaseUrl(url)).pathname.toLowerCase();
  } catch (_) {
    return "";
  }
}

/* ------------------------------------------------------------------ */
/* Data URLs                                                            */
/* ------------------------------------------------------------------ */

/** Split "data:image/jpeg;base64,AAAA" into { mimeType, base64 }. */
export function splitDataUrl(dataUrl) {
  const m = /^data:([^;,]+)(?:;[^,]*)?;base64,(.*)$/s.exec(String(dataUrl || ""));
  if (!m) throw new QuizKeyError(ErrorCodes.CAPTURE_FAILED, "Capture is not a base64 data URL");
  return { mimeType: m[1], base64: m[2] };
}

/* ------------------------------------------------------------------ */
/* Fetch with timeout + keep-alive                                      */
/* ------------------------------------------------------------------ */

/**
 * MV3 service workers are killed after ~30 s idle. A long fetch alone does
 * not always reset that timer, but any extension API call does, so we
 * ping a cheap one every 20 s while a request is in flight.
 */
function startKeepAlive() {
  if (typeof chrome === "undefined" || !chrome?.runtime?.getPlatformInfo) return () => {};
  const id = setInterval(() => {
    try {
      chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError);
    } catch (_) {
      /* ignore */
    }
  }, 20000);
  return () => clearInterval(id);
}

/**
 * fetch() that converts network failures + timeouts into QuizKeyErrors and
 * records the call in the diagnostics log. Resolves with the Response for
 * any HTTP status; callers decide what a non-2xx means.
 */
export async function request(url, init = {}, { timeoutMs = DEFAULT_TIMEOUT_MS, label = "" } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const stopKeepAlive = startKeepAlive();
  const started = Date.now();
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    void logCall({ label, url, method: init.method || "GET", status: response.status, ms: Date.now() - started });
    return response;
  } catch (err) {
    const timedOut = err && err.name === "AbortError";
    void logCall({
      label,
      url,
      method: init.method || "GET",
      status: timedOut ? "timeout" : "network-error",
      ms: Date.now() - started,
      error: String(err && err.message ? err.message : err),
    });
    if (timedOut) {
      throw new QuizKeyError(ErrorCodes.API_TIMEOUT, `Request aborted after ${timeoutMs} ms`, err);
    }
    throw new QuizKeyError(
      ErrorCodes.API_CONNECTION_FAILED,
      String(err && err.message ? err.message : err),
      err,
      connectionFailureMessage(url)
    );
  } finally {
    clearTimeout(timer);
    stopKeepAlive();
  }
}

function connectionFailureMessage(url) {
  let host = url;
  try {
    host = new URL(url).origin;
  } catch (_) {
    /* keep raw */
  }
  if (isLocalEndpoint(url)) {
    return (
      `Could not reach ${host}. Make sure the local server is running on that port and allows ` +
      `browser extensions: Ollama → start with OLLAMA_ORIGINS="*"; LM Studio → enable CORS in the ` +
      `Developer/Server tab. Then click "Grant access" next to the base URL in QuizKey settings.`
    );
  }
  return (
    `Could not reach ${host}. Check the base URL and your network. If the endpoint is not one of ` +
    `the built-in providers, click "Grant access" next to the base URL in QuizKey settings.`
  );
}

/* ------------------------------------------------------------------ */
/* Provider errors                                                      */
/* ------------------------------------------------------------------ */

/** Pull the human-readable message out of a provider error body. */
export function extractProviderError(bodyText) {
  const raw = String(bodyText || "").trim();
  if (!raw) return "";
  try {
    const j = JSON.parse(raw);
    const candidates = [
      j?.error?.message,
      j?.error?.error?.message,
      j?.message,
      j?.detail?.message,
      j?.detail,
      j?.error,
      Array.isArray(j) ? j[0]?.error?.message : null,
    ];
    for (const c of candidates) {
      if (typeof c === "string" && c.trim()) return c.trim().slice(0, 300);
    }
  } catch (_) {
    /* not JSON, probably an HTML error page */
  }
  return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
}

/** Map an HTTP status + provider text to a precise, actionable QuizKeyError. */
export function httpError(status, bodyText, { model = "", base = "" } = {}) {
  const detail = extractProviderError(bodyText).replace(/[.\s]+$/, "");
  const suffix = detail ? `: ${detail}` : "";
  let code = ErrorCodes.API_REQUEST_FAILED;
  let msg;

  if (status === 401 || status === 403) {
    code = ErrorCodes.API_KEY_MISSING;
    msg = `The provider rejected the API key (HTTP ${status})${suffix}. Check the key on the QuizKey settings page.`;
  } else if (status === 404) {
    msg = `Not found (HTTP 404)${suffix}. Check the base URL (${base}) and that the model "${model}" exists on this provider; use "Load models" in settings.`;
  } else if (status === 429) {
    msg = `Rate limit or quota exceeded (HTTP 429)${suffix}. Wait a moment or check your provider billing.`;
  } else if (status === 402) {
    msg = `The provider requires payment / credits (HTTP 402)${suffix}.`;
  } else if (status === 413) {
    msg = `The screenshot is too large for this provider (HTTP 413)${suffix}. Lower "Max image size" or JPEG quality in settings.`;
  } else if (status >= 500) {
    msg = `The provider is having trouble (HTTP ${status})${suffix}. Try again in a moment.`;
  } else {
    msg = `The provider rejected the request (HTTP ${status})${suffix}. Check the model name "${model}" and the base URL.`;
  }
  return new QuizKeyError(code, `HTTP ${status}: ${String(bodyText || "").slice(0, 400)}`, undefined, msg);
}

/**
 * Does a 400/422 body complain about a specific parameter? Returns the
 * parameter family so adapters can retry without it.
 */
export function rejectedParam(status, bodyText) {
  if (![400, 422].includes(status)) return null;
  const text = String(bodyText || "").toLowerCase();
  if (!text) return null;
  const paramish =
    /unsupported|not supported|unknown|unrecognized|invalid|extra|additional propert|unexpected|does not support|isn't supported|is not allowed|cannot be used|not allowed/.test(
      text
    );
  if (!paramish) return null;
  if (/max_tokens/.test(text) && /max_completion_tokens/.test(text)) return "max_tokens";
  if (/temperature|top_p|top_k|sampling/.test(text)) return "temperature";
  if (/response_format|json_object|json mode|json_schema|structured output|response_mime_type|responsemimetype/.test(text))
    return "json_mode";
  if (/reasoning_effort|reasoning effort|thinking_config|thinkingconfig|thinking_level|thinkinglevel|thinking_budget|thinkingbudget|thinking/.test(text))
    return "reasoning";
  if (/\bstream\b/.test(text)) return "stream";
  return null;
}

/* ------------------------------------------------------------------ */
/* Diagnostics log                                                      */
/* ------------------------------------------------------------------ */

const LOG_KEY = "quizkey.lastCalls";
const LOG_MAX = 12;

/** Append to a small ring buffer in chrome.storage.session (never keys). */
export async function logCall(entry) {
  try {
    const area = chrome?.storage?.session || chrome?.storage?.local;
    if (!area) return;
    const cur = (await area.get(LOG_KEY))[LOG_KEY] || [];
    cur.push({ at: Date.now(), ...entry });
    await area.set({ [LOG_KEY]: cur.slice(-LOG_MAX) });
  } catch (_) {
    /* diagnostics must never break the pipeline */
  }
}

export async function readCallLog() {
  try {
    const area = chrome?.storage?.session || chrome?.storage?.local;
    if (!area) return [];
    return (await area.get(LOG_KEY))[LOG_KEY] || [];
  } catch (_) {
    return [];
  }
}

export async function clearCallLog() {
  try {
    const area = chrome?.storage?.session || chrome?.storage?.local;
    if (area) await area.remove(LOG_KEY);
  } catch (_) {
    /* ignore */
  }
}
