/**
 * lib/adapters/anthropic.js
 * Anthropic Messages API (api.anthropic.com/v1).
 *
 * Request:  POST {base}/messages
 * Auth:     x-api-key: <key>, anthropic-version: 2023-06-01
 * Browser:  anthropic-dangerous-direct-browser-access: true  (required for
 *           CORS from extensions/browsers; the key stays in the worker)
 * Docs:     https://docs.claude.com/en/api/messages
 */

import { QuizKeyError, ErrorCodes } from "../errors.js";
import { request, httpError } from "../http.js";

const ANTHROPIC_VERSION = "2023-06-01";

function headers(apiKey) {
  return {
    "Content-Type": "application/json",
    "anthropic-version": ANTHROPIC_VERSION,
    "anthropic-dangerous-direct-browser-access": "true",
    ...(apiKey ? { "x-api-key": apiKey } : {}),
  };
}

export function buildBody({ model, system, user, image, maxTokens }) {
  // No temperature: Claude 4.6+ / 5 reject non-default sampling parameters.
  // `image` is optional: omitted for the HTML quiz source.
  const content = [];
  if (image?.base64) {
    content.push({ type: "image", source: { type: "base64", media_type: image.mimeType, data: image.base64 } });
  }
  content.push({ type: "text", text: user });
  return {
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content }],
  };
}

export async function complete({ base, settings, image, system, user, maxTokens, timeoutMs }) {
  const model = settings.model;
  if (!model) throw new QuizKeyError(ErrorCodes.API_REQUEST_FAILED, "Empty model", undefined,
    "No model configured. Enter a Claude model such as claude-sonnet-5.");

  const res = await request(`${base}/messages`, {
    method: "POST",
    headers: headers(settings.apiKey),
    body: JSON.stringify(buildBody({ model, system, user, image, maxTokens })),
  }, { timeoutMs, label: "analyze" });

  if (!res.ok) throw httpError(res.status, await res.text().catch(() => ""), { model, base });
  const payload = await res.json().catch((err) => {
    throw new QuizKeyError(ErrorCodes.API_BAD_RESPONSE, "Response was not JSON", err);
  });

  const text = (payload?.content || [])
    .filter((b) => b?.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("\n");
  return {
    text,
    finishReason: payload?.stop_reason || "",
    reasoningOnly: !text && payload?.stop_reason === "max_tokens",
    refusal: payload?.stop_reason === "refusal" ? "refusal" : "",
    blocked: "",
    model: payload?.model || model,
    raw: payload,
  };
}

export async function listModels({ base, settings, timeoutMs = 20000 }) {
  const res = await request(`${base}/models?limit=100`, { method: "GET", headers: headers(settings.apiKey) },
    { timeoutMs, label: "models" });
  if (!res.ok) throw httpError(res.status, await res.text().catch(() => ""), { base, model: settings.model });
  const j = await res.json().catch(() => ({}));
  return (j?.data || []).map((m) => m?.id).filter(Boolean);
}

export async function probe({ base, settings, timeoutMs }) {
  const res = await request(`${base}/messages`, {
    method: "POST",
    headers: headers(settings.apiKey),
    body: JSON.stringify({ model: settings.model, max_tokens: 16,
      messages: [{ role: "user", content: "Reply with the single word: pong" }] }),
  }, { timeoutMs, label: "probe" });
  if (!res.ok) throw httpError(res.status, await res.text().catch(() => ""), { base, model: settings.model });
  return { model: settings.model, base };
}
