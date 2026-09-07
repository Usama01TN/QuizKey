/**
 * lib/ai-client.js
 * Provider-agnostic facade used by the background worker and the options
 * page. Picks the right API dialect for the configured endpoint and turns
 * the model's reply into the analysis object the extension consumes.
 *
 *   analyzeScreenshot({ dataUrl, settings })  → analysis
 *   testConnection(settings)                  → human-readable summary
 *   listModels(settings)                      → string[]
 *
 * Dialects live in lib/adapters/*.js; endpoint knowledge in lib/providers.js.
 */

import { QuizKeyError, ErrorCodes } from "./errors.js";
import { SYSTEM_PROMPT, buildUserText } from "./prompts.js";
import { analysisFromReply } from "./analysis.js";
import { normalizeBaseUrl, splitDataUrl, DEFAULT_TIMEOUT_MS } from "./http.js";
import { resolveApiStyle, hasUsableCredentials, getProvider, detectProvider } from "./providers.js";
import * as openai from "./adapters/openai.js";
import * as gemini from "./adapters/gemini.js";
import * as anthropic from "./adapters/anthropic.js";

export {
  normalizeBaseUrl,
  isLocalEndpoint,
  originPattern,
  readCallLog,
  clearCallLog,
} from "./http.js";
export {
  PROVIDERS,
  getProvider,
  detectProvider,
  resolveApiStyle,
  requiresApiKey,
  hasUsableCredentials,
  looksLikeReasoningModel,
} from "./providers.js";

const ADAPTERS = { openai, gemini, anthropic };
const DEFAULT_MAX_OUTPUT_TOKENS = 4096;

function adapterFor(settings) {
  const style = resolveApiStyle(settings);
  return { style, adapter: ADAPTERS[style] || openai };
}

function prepared(settings) {
  const base = normalizeBaseUrl(settings.apiBaseUrl);
  if (!base) {
    throw new QuizKeyError(ErrorCodes.API_CONNECTION_FAILED, "Empty base URL", undefined,
      "No AI endpoint configured. Open the QuizKey settings page and pick a provider.");
  }
  if (/YOUR-RESOURCE|YOUR-DEPLOYMENT/i.test(base)) {
    throw new QuizKeyError(ErrorCodes.API_CONNECTION_FAILED, "Placeholder base URL", undefined,
      "The Azure base URL still contains YOUR-RESOURCE / YOUR-DEPLOYMENT placeholders — fill them in.");
  }
  if (!hasUsableCredentials(settings)) throw new QuizKeyError(ErrorCodes.API_KEY_MISSING);
  return base;
}

/**
 * Analyze a page screenshot with a vision model.
 * @param {{ dataUrl: string, settings: import('./storage.js').QuizKeySettings }} args
 */
export async function analyzeScreenshot({ dataUrl, settings }) {
  const base = prepared(settings);
  const { adapter, style } = adapterFor(settings);
  const image = { ...splitDataUrl(dataUrl), dataUrl };

  const reply = await adapter.complete({
    base,
    settings,
    image,
    system: SYSTEM_PROMPT,
    user: buildUserText(settings.extraInstructions),
    maxTokens: Number(settings.maxOutputTokens) || DEFAULT_MAX_OUTPUT_TOKENS,
    timeoutMs: Number(settings.requestTimeoutMs) || DEFAULT_TIMEOUT_MS,
  });

  const analysis = analysisFromReply(reply);
  analysis.model = reply.model || settings.model;
  analysis.apiStyle = style;
  return analysis;
}

/** List the models the endpoint serves (for the settings page picker). */
export async function listModels(settings) {
  const base = prepared(settings);
  const { adapter } = adapterFor(settings);
  return adapter.listModels({ base, settings, timeoutMs: 20000 });
}

/**
 * "Test connection": list models (free) and, if the endpoint can't, send a
 * tiny completion. Resolves to a human-readable summary.
 */
export async function testConnection(settings) {
  const base = prepared(settings);
  const { adapter, style } = adapterFor(settings);
  const provider = detectProvider(base) || getProvider(settings.provider);
  const where = `${provider?.label || "endpoint"} · ${style} API`;
  const timeoutMs = 25000;

  let ids = null;
  try {
    ids = await adapter.listModels({ base, settings, timeoutMs });
  } catch (err) {
    // Auth errors are definitive — surface them. Anything else (404 on a
    // gateway without /models, 405…) falls through to the completion probe.
    if (err?.code === ErrorCodes.API_KEY_MISSING || err?.code === ErrorCodes.API_CONNECTION_FAILED || err?.code === ErrorCodes.API_TIMEOUT) throw err;
  }

  if (Array.isArray(ids) && ids.length) {
    const model = settings.model;
    let hint = "";
    if (!model) hint = ` No model set — the first served model (${ids[0]}) will be used.`;
    else if (!ids.includes(model) && !ids.includes(`models/${model}`)) {
      const tail = String(model).toLowerCase().split(/[:/]/).pop();
      const near = ids.filter((id) => id.toLowerCase().includes(tail)).slice(0, 3);
      hint = ` Warning: "${model}" is not in the provider's list${near.length ? ` (similar: ${near.join(", ")})` : ""} — click "Load models".`;
    }
    return `Connection OK — ${where} answered with ${ids.length} model${ids.length === 1 ? "" : "s"}.${hint}`;
  }

  const res = await adapter.probe({ base, settings, timeoutMs });
  return `Connection OK — ${where} answered a test completion with "${res.model}".` +
    (res.base && res.base !== base ? ` Tip: set the base URL to "${res.base}".` : "");
}
