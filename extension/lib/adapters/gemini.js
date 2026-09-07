/**
 * lib/adapters/gemini.js
 * Google's native Gemini API (generativelanguage.googleapis.com/v1beta).
 *
 * Request:  POST {base}/models/{model}:generateContent
 * Auth:     x-goog-api-key: <key>
 * Docs:     https://ai.google.dev/api/generate-content
 */

import { QuizKeyError, ErrorCodes } from "../errors.js";
import { request, httpError, rejectedParam } from "../http.js";

const learnedQuirks = new Map();

function headers(apiKey) {
  return { "Content-Type": "application/json", ...(apiKey ? { "x-goog-api-key": apiKey } : {}) };
}

/** Gemini 3.x uses thinkingLevel; 2.5 uses thinkingBudget. Both are best-effort. */
function thinkingConfig(model) {
  const m = String(model || "").toLowerCase();
  if (/gemini-3/.test(m)) return { thinkingLevel: "low" };
  if (/gemini-2\.5/.test(m)) return { thinkingBudget: 1024 };
  return null;
}

export function buildBody({ model, system, user, image, maxTokens, quirks }) {
  const generationConfig = { maxOutputTokens: maxTokens };
  if (!quirks.has("json_mode")) generationConfig.responseMimeType = "application/json";
  const thinking = thinkingConfig(model);
  if (thinking && !quirks.has("reasoning")) generationConfig.thinkingConfig = thinking;

  return {
    systemInstruction: { parts: [{ text: system }] },
    contents: [
      {
        role: "user",
        parts: [{ text: user }, { inlineData: { mimeType: image.mimeType, data: image.base64 } }],
      },
    ],
    generationConfig,
  };
}

function modelPath(model) {
  const m = String(model || "").trim();
  return m.startsWith("models/") ? m : `models/${m}`;
}

export async function complete({ base, settings, image, system, user, maxTokens, timeoutMs }) {
  const model = settings.model;
  if (!model) throw new QuizKeyError(ErrorCodes.API_REQUEST_FAILED, "Empty model", undefined,
    "No model configured. Enter a Gemini model such as gemini-3.8-flash.");

  const key = `${base}|${model}`;
  const quirks = new Set(learnedQuirks.get(key) || []);
  const url = `${base}/${modelPath(model)}:generateContent`;

  for (let attempt = 0; attempt < 4; attempt++) {
    const body = buildBody({ model, system, user, image, maxTokens, quirks });
    const response = await request(url, { method: "POST", headers: headers(settings.apiKey), body: JSON.stringify(body) },
      { timeoutMs, label: "analyze" });

    if (response.ok) {
      if (quirks.size) learnedQuirks.set(key, quirks);
      const payload = await response.json().catch((err) => {
        throw new QuizKeyError(ErrorCodes.API_BAD_RESPONSE, "Response was not JSON", err);
      });
      return normalize(payload, model);
    }

    const text = await response.text().catch(() => "");
    const rejected = rejectedParam(response.status, text);
    if (rejected && !quirks.has(rejected)) {
      quirks.add(rejected);
      continue;
    }
    throw httpError(response.status, text, { model, base });
  }
  throw new QuizKeyError(ErrorCodes.API_REQUEST_FAILED, "Gave up after repeated parameter rejections");
}

function normalize(payload, model) {
  const candidate = payload?.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  const text = parts
    .filter((p) => typeof p?.text === "string" && !p.thought) // skip thought summaries
    .map((p) => p.text)
    .join("\n");
  const finish = candidate?.finishReason || "";
  const blockReason = payload?.promptFeedback?.blockReason || (finish === "SAFETY" ? "SAFETY" : "");
  return {
    text,
    finishReason: finish,
    reasoningOnly: !text && (finish === "MAX_TOKENS" || Boolean(payload?.usageMetadata?.thoughtsTokenCount)),
    refusal: "",
    blocked: blockReason,
    model: payload?.modelVersion || model,
    raw: payload,
  };
}

/** GET {base}/models → ["gemini-…", …] (only generateContent-capable ones). */
export async function listModels({ base, settings, timeoutMs = 20000 }) {
  const res = await request(`${base}/models?pageSize=200`, { method: "GET", headers: headers(settings.apiKey) },
    { timeoutMs, label: "models" });
  if (!res.ok) throw httpError(res.status, await res.text().catch(() => ""), { base, model: settings.model });
  const j = await res.json().catch(() => ({}));
  return (j?.models || [])
    .filter((m) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes("generateContent"))
    .map((m) => String(m.name || "").replace(/^models\//, ""))
    .filter(Boolean);
}

export async function probe({ base, settings, timeoutMs }) {
  const url = `${base}/${modelPath(settings.model)}:generateContent`;
  const res = await request(url, {
    method: "POST",
    headers: headers(settings.apiKey),
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Reply with the single word: pong" }] }],
      generationConfig: { maxOutputTokens: 16 } }),
  }, { timeoutMs, label: "probe" });
  if (!res.ok) throw httpError(res.status, await res.text().catch(() => ""), { base, model: settings.model });
  return { model: settings.model, base };
}
