/**
 * lib/providers.js
 * The single source of truth for every supported AI provider: canonical
 * base URL, which API dialect it speaks, how it authenticates, where to
 * get a key, and a sensible vision-capable default model.
 *
 * Every URL below was checked against the provider's own documentation
 * (September 2026). If you add a provider, verify the URL there first.
 *
 * API dialects (see lib/adapters/):
 *   "openai"    — POST {base}/chat/completions          Bearer key
 *   "gemini"    — POST {base}/models/{model}:generateContent   x-goog-api-key
 *   "anthropic" — POST {base}/messages                   x-api-key
 */

import { hostOf, pathOf, isLocalEndpoint, normalizeBaseUrl } from "./http.js";

/**
 * @typedef {Object} ProviderPreset
 * @property {string}  id
 * @property {string}  label
 * @property {"openai"|"gemini"|"anthropic"} api
 * @property {string}  baseUrl
 * @property {string}  model            default vision-capable model
 * @property {string[]} [altModels]     other known-good models
 * @property {boolean} needsKey
 * @property {string}  [keyUrl]
 * @property {string}  [docsUrl]
 * @property {string}  note             one-line setup hint shown in the UI
 * @property {boolean} [manifestGranted] host permission already in manifest.json
 */

/** @type {ProviderPreset[]} */
export const PROVIDERS = [
  {
    id: "openai",
    label: "OpenAI",
    api: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    altModels: ["gpt-4o", "gpt-5.6-terra", "gpt-5.6-sol"],
    needsKey: true,
    keyUrl: "https://platform.openai.com/api-keys",
    docsUrl: "https://developers.openai.com/api/docs/guides/images-vision",
    note: "gpt-4o-mini is cheap and fast. GPT-5.x models also work (they reject temperature; QuizKey adapts).",
    manifestGranted: true,
  },
  {
    id: "anthropic",
    label: "Anthropic Claude",
    api: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-sonnet-5",
    altModels: ["claude-haiku-4-5-20251001", "claude-opus-5"],
    needsKey: true,
    keyUrl: "https://console.anthropic.com/settings/keys",
    docsUrl: "https://docs.claude.com/en/api/messages",
    note: "Native Messages API. All current Claude models accept images. Sonnet 5 rejects temperature — QuizKey never sends it.",
    manifestGranted: true,
  },
  {
    id: "gemini",
    label: "Google Gemini (native API)",
    api: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    model: "gemini-3.8-flash",
    altModels: ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash"],
    needsKey: true,
    keyUrl: "https://aistudio.google.com/apikey",
    docsUrl: "https://ai.google.dev/gemini-api/docs/image-understanding",
    note: "Recommended for Gemini. Gemini 3 always 'thinks'; QuizKey requests low thinking + JSON output.",
    manifestGranted: true,
  },
  {
    id: "gemini-openai",
    label: "Google Gemini (OpenAI-compatible layer)",
    api: "openai",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-3.8-flash",
    altModels: ["gemini-3.5-flash", "gemini-2.5-flash"],
    needsKey: true,
    keyUrl: "https://aistudio.google.com/apikey",
    docsUrl: "https://ai.google.dev/gemini-api/docs/openai",
    note: "Same key as the native preset. Google marks this layer as beta — use the native preset if something is off.",
    manifestGranted: true,
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    api: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4o-mini",
    altModels: ["google/gemini-2.5-flash", "anthropic/claude-sonnet-4.5", "qwen/qwen2.5-vl-72b-instruct:free"],
    needsKey: true,
    keyUrl: "https://openrouter.ai/keys",
    docsUrl: "https://openrouter.ai/docs/quickstart",
    note: "One key, hundreds of models. Filter for models with image input.",
    manifestGranted: true,
  },
  {
    id: "omniroute",
    label: "OmniRoute (local gateway)",
    api: "openai",
    baseUrl: "http://localhost:20128/v1",
    model: "gemini-3-flash",
    altModels: ["auto", "claude-sonnet-4-5"],
    needsKey: true,
    keyUrl: "http://localhost:20128",
    docsUrl: "https://github.com/diegosouzapw/OmniRoute",
    note: "npm i -g omniroute && omniroute. Create an API key in Dashboard → Endpoints. Model IDs are plain names (or provider/model). Pick a vision model; \"auto\" may route to a text-only one.",
  },
  {
    id: "lmstudio",
    label: "LM Studio (local)",
    api: "openai",
    baseUrl: "http://localhost:1234/v1",
    model: "",
    needsKey: false,
    docsUrl: "https://lmstudio.ai/docs/app/api/endpoints/openai",
    note: "Start the server in the Developer tab and enable CORS. Leave model empty to use whatever is loaded, or click \"Load models\".",
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    api: "openai",
    baseUrl: "http://localhost:11434/v1",
    model: "llama3.2-vision",
    altModels: ["qwen2.5vl", "gemma3", "llava"],
    needsKey: false,
    docsUrl: "https://docs.ollama.com/api/openai-compatibility",
    note: "Run: OLLAMA_ORIGINS=\"*\" ollama serve, then ollama pull llama3.2-vision. Ollama's /v1 endpoint ignores the key.",
  },
  {
    id: "azure",
    label: "Azure OpenAI",
    api: "openai",
    baseUrl: "https://YOUR-RESOURCE.openai.azure.com/openai/deployments/YOUR-DEPLOYMENT",
    model: "gpt-4o-mini",
    needsKey: true,
    docsUrl: "https://learn.microsoft.com/azure/ai-services/openai/reference",
    note: "Replace YOUR-RESOURCE and YOUR-DEPLOYMENT. QuizKey sends the api-key header and api-version query automatically.",
  },
  {
    id: "custom",
    label: "Custom endpoint",
    api: "openai",
    baseUrl: "",
    model: "",
    needsKey: true,
    note: "Any OpenAI-compatible server (vLLM, llama.cpp, Groq, Mistral, xAI, Together…). Paste its /v1 base URL.",
  },
];

export const PROVIDER_BY_ID = Object.fromEntries(PROVIDERS.map((p) => [p.id, p]));

export function getProvider(id) {
  return PROVIDER_BY_ID[id] || PROVIDER_BY_ID.custom;
}

/** Match a base URL back to a preset (used when the user edits the URL by hand). */
export function detectProvider(baseUrl) {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) return null;
  const exact = PROVIDERS.find((p) => p.baseUrl && normalizeBaseUrl(p.baseUrl) === base);
  if (exact) return exact;
  const host = hostOf(base);
  const path = pathOf(base);
  if (host === "generativelanguage.googleapis.com") {
    return path.includes("/openai") ? PROVIDER_BY_ID["gemini-openai"] : PROVIDER_BY_ID.gemini;
  }
  if (host === "api.anthropic.com") return PROVIDER_BY_ID.anthropic;
  if (host === "api.openai.com") return PROVIDER_BY_ID.openai;
  if (host === "openrouter.ai") return PROVIDER_BY_ID.openrouter;
  if (host.endsWith(".openai.azure.com") || host.endsWith(".cognitiveservices.azure.com")) return PROVIDER_BY_ID.azure;
  if (isLocalEndpoint(base)) {
    const port = (() => {
      try {
        return new URL(base).port;
      } catch (_) {
        return "";
      }
    })();
    if (port === "11434") return PROVIDER_BY_ID.ollama;
    if (port === "1234") return PROVIDER_BY_ID.lmstudio;
    if (port === "20128") return PROVIDER_BY_ID.omniroute;
  }
  return null;
}

/**
 * Which API dialect to speak. `settings.apiStyle` may pin it ("openai",
 * "gemini", "anthropic"); "auto" infers it from the URL.
 */
export function resolveApiStyle(settings) {
  const pinned = settings?.apiStyle;
  if (pinned && pinned !== "auto") return pinned;
  const host = hostOf(settings?.apiBaseUrl);
  const path = pathOf(settings?.apiBaseUrl);
  if (host === "generativelanguage.googleapis.com" && !path.includes("/openai")) return "gemini";
  if (host === "api.anthropic.com") return "anthropic";
  return "openai";
}

export function isAzure(baseUrl) {
  const host = hostOf(baseUrl);
  return host.endsWith(".openai.azure.com") || host.endsWith(".cognitiveservices.azure.com");
}

/** Local servers usually run without auth — only remote ones need a key. */
export function requiresApiKey(settings) {
  return !isLocalEndpoint(settings?.apiBaseUrl);
}

export function hasUsableCredentials(settings) {
  return Boolean(settings?.apiKey) || !requiresApiKey(settings);
}

/**
 * Models whose hidden reasoning consumes output tokens. These need a big
 * budget and a low reasoning effort to answer a simple quiz screenshot.
 */
export function looksLikeReasoningModel(model) {
  const m = String(model || "").toLowerCase();
  return (
    /gemini-(2\.5|3)/.test(m) ||
    /(^|\/)gpt-5/.test(m) ||
    /(^|\/)o[1-9](-|$)/.test(m) ||
    /deepseek-r|deepseek-reasoner|qwq|thinking|reason|-r1(\b|-)/.test(m) ||
    /(^|\/)gpt-oss/.test(m) ||
    /claude-(sonnet|opus|haiku)-(4\.[6-9]|[5-9])/.test(m)
  );
}
