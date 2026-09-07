/**
 * lib/adapters/openai.js
 * The OpenAI Chat Completions dialect — spoken by OpenAI, OpenRouter,
 * OmniRoute, LM Studio, Ollama (/v1), vLLM, Groq, Mistral, xAI, Azure
 * OpenAI and Gemini's compatibility layer.
 *
 * Request:  POST {base}/chat/completions
 * Auth:     Authorization: Bearer <key>   (Azure: api-key: <key>)
 */

import { QuizKeyError, ErrorCodes } from "../errors.js";
import { request, httpError, rejectedParam, splitDataUrl } from "../http.js";
import { isAzure, looksLikeReasoningModel } from "../providers.js";

const AZURE_API_VERSION = "2024-10-21";

/** Per-endpoint memory of rejected parameters (worker lifetime). */
const learnedQuirks = new Map();

export function headers(base, apiKey, extra = {}) {
  const h = { "Content-Type": "application/json", ...extra };
  if (apiKey) {
    if (isAzure(base)) h["api-key"] = apiKey;
    else h.Authorization = `Bearer ${apiKey}`;
  }
  if (/openrouter\.ai/i.test(base)) {
    h["HTTP-Referer"] = "https://github.com/quizkey";
    h["X-Title"] = "QuizKey";
  }
  return h;
}

export function endpoint(base, path) {
  const url = `${base}${path}`;
  return isAzure(base) ? `${url}?api-version=${AZURE_API_VERSION}` : url;
}

/** Build the body honoring the quirks discovered so far. */
export function buildBody({ model, messages, maxTokens, quirks }) {
  const reasoning = looksLikeReasoningModel(model);
  const body = { model, messages, stream: false };
  if (quirks.has("max_tokens")) body.max_completion_tokens = maxTokens;
  else body.max_tokens = maxTokens;
  if (!reasoning && !quirks.has("temperature")) body.temperature = 0;
  if (!quirks.has("json_mode")) body.response_format = { type: "json_object" };
  if (reasoning && !quirks.has("reasoning")) body.reasoning_effort = "low";
  if (quirks.has("stream")) delete body.stream;
  return body;
}

/** Flatten `message.content` (string or array of parts) to plain text. */
export function contentText(message) {
  const content = message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (typeof p === "string" ? p : p?.text ?? p?.content ?? p?.output_text ?? ""))
      .filter(Boolean)
      .join("\n");
  }
  if (content && typeof content === "object" && typeof content.text === "string") return content.text;
  return "";
}

/**
 * POST /chat/completions with automatic quirk-correcting retries and a
 * one-time "/v1" fallback for base URLs that forgot it.
 */
export async function chatCompletions({ base, settings, messages, maxTokens, timeoutMs, label = "chat" }) {
  let model = settings.model;
  let currentBase = base;
  if (!model) {
    const picked = await pickLoadedModel({ base, settings, timeoutMs });
    model = picked.model;
    currentBase = picked.base; // may already include the "/v1" fallback
  }

  const key = `${base}|${model}`;
  const quirks = new Set(learnedQuirks.get(key) || []);
  let triedV1 = currentBase !== base;

  for (let attempt = 0; attempt < 6; attempt++) {
    const body = buildBody({ model, messages, maxTokens, quirks });
    const response = await request(
      endpoint(currentBase, "/chat/completions"),
      { method: "POST", headers: headers(currentBase, settings.apiKey), body: JSON.stringify(body) },
      { timeoutMs, label }
    );

    if (response.ok) {
      if (quirks.size) learnedQuirks.set(key, quirks);
      let payload;
      try {
        payload = await response.json();
      } catch (err) {
        throw new QuizKeyError(ErrorCodes.API_BAD_RESPONSE, "Response was not JSON", err);
      }
      return { payload, base: currentBase, model };
    }

    const text = await response.text().catch(() => "");

    if (response.status === 404 && !triedV1 && !/\/v\d+[a-z]*(\/openai)?$/i.test(currentBase) && !isAzure(currentBase)) {
      triedV1 = true;
      currentBase = `${currentBase}/v1`;
      continue;
    }

    const rejected = rejectedParam(response.status, text);
    if (rejected && !quirks.has(rejected)) {
      quirks.add(rejected);
      continue;
    }

    throw httpError(response.status, text, { model, base: currentBase });
  }
  throw new QuizKeyError(ErrorCodes.API_REQUEST_FAILED, "Gave up after repeated parameter rejections");
}

/** LM Studio & co: when no model is configured, use the first one served. */
async function pickLoadedModel({ base, settings, timeoutMs }) {
  const { ids, base: effectiveBase } = await listModelsWithBase({ base, settings, timeoutMs }).catch(() => ({ ids: [], base }));
  if (!ids.length) {
    throw new QuizKeyError(ErrorCodes.API_REQUEST_FAILED, "No model configured and /models is empty", undefined,
      "No model is configured and the server lists none. Load a vision model in your local server, or type a model name in QuizKey settings.");
  }
  return { model: ids[0], base: effectiveBase };
}

/** GET /models → { ids, base }. Tries "/v1" once if the base forgot it. */
async function listModelsWithBase({ base, settings, timeoutMs = 20000 }) {
  const attempt = (b) =>
    request(endpoint(b, "/models"), { method: "GET", headers: headers(b, settings.apiKey) }, { timeoutMs, label: "models" });
  let res = await attempt(base);
  let effectiveBase = base;
  if (res.status === 404 && !/\/v\d+[a-z]*(\/openai)?$/i.test(base) && !isAzure(base)) {
    const alt = await attempt(`${base}/v1`);
    if (alt.status !== 404) {
      res = alt;
      effectiveBase = `${base}/v1`;
    }
  }
  if (!res.ok) throw httpError(res.status, await res.text().catch(() => ""), { base, model: settings.model });
  const j = await res.json().catch(() => ({}));
  const list = j?.data || j?.models || (Array.isArray(j) ? j : []);
  return { ids: list.map((m) => (typeof m === "string" ? m : m?.id || m?.name)).filter(Boolean), base: effectiveBase };
}

/** GET /models → array of ids. */
export async function listModels(args) {
  return (await listModelsWithBase(args)).ids;
}

/** Vision completion → normalized reply for lib/analysis.js. */
export async function complete({ base, settings, image, system, user, maxTokens, timeoutMs }) {
  const messages = [
    { role: "system", content: system },
    {
      role: "user",
      content: [
        { type: "text", text: user },
        { type: "image_url", image_url: { url: image.dataUrl, detail: "high" } },
      ],
    },
  ];
  const { payload, model } = await chatCompletions({ base, settings, messages, maxTokens, timeoutMs, label: "analyze" });

  if (payload?.error) {
    throw new QuizKeyError(ErrorCodes.API_REQUEST_FAILED, JSON.stringify(payload.error).slice(0, 300), undefined,
      `The provider returned an error: ${payload.error?.message || JSON.stringify(payload.error).slice(0, 200)}`);
  }

  const choice = payload?.choices?.[0];
  const message = choice?.message ?? choice?.delta ?? null;
  return {
    text: contentText(message),
    finishReason: choice?.finish_reason || "",
    reasoningOnly: Boolean(message?.reasoning_content || message?.reasoning) && !contentText(message),
    refusal: message?.refusal || "",
    blocked: choice?.finish_reason === "content_filter" ? "content_filter" : "",
    model: payload?.model || model,
    raw: payload,
  };
}

/** Cheap probe used by "Test connection" when /models is unavailable. */
export async function probe({ base, settings, timeoutMs }) {
  const { model, base: effectiveBase } = await chatCompletions({
    base,
    settings,
    messages: [{ role: "user", content: "Reply with the single word: pong" }],
    maxTokens: 16,
    timeoutMs,
    label: "probe",
  });
  return { model, base: effectiveBase };
}

export { splitDataUrl };
