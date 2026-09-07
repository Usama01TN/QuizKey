/**
 * lib/analysis.js
 * Turns whatever text a model produced into the stable analysis object the
 * rest of the extension consumes. Provider-agnostic: adapters hand over the
 * plain reply text plus a little metadata.
 */

import { QuizKeyError, ErrorCodes } from "./errors.js";

const JSON_FENCE = /```(?:json)?\s*([\s\S]*?)```/i;

/** Try hard to get a JSON object out of a model reply. */
export function looseJsonParse(raw) {
  const text = String(raw || "");
  const fenced = text.match(JSON_FENCE);
  const candidates = [fenced ? fenced[1] : null, text];
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));

  for (const c of candidates) {
    if (!c) continue;
    try {
      const v = JSON.parse(c.trim());
      if (v && typeof v === "object" && !Array.isArray(v)) return v;
    } catch (_) {
      /* try next */
    }
  }
  return null;
}

/**
 * @param {{ text: string, finishReason?: string, reasoningOnly?: boolean, refusal?: string, blocked?: string, model?: string }} reply
 */
export function analysisFromReply(reply) {
  const raw = String(reply?.text || "").trim();

  if (!raw) {
    if (reply?.refusal) {
      throw new QuizKeyError(ErrorCodes.API_BAD_RESPONSE, `Refusal: ${reply.refusal}`, undefined,
        `The model refused to answer: ${String(reply.refusal).slice(0, 200)}`);
    }
    if (reply?.blocked) {
      throw new QuizKeyError(ErrorCodes.API_BAD_RESPONSE, `Blocked: ${reply.blocked}`, undefined,
        `The provider's safety filter blocked this screenshot (${reply.blocked}). Try another model.`);
    }
    if (reply?.reasoningOnly || /length|max_tokens|max_output_tokens/i.test(String(reply?.finishReason || ""))) {
      throw new QuizKeyError(ErrorCodes.API_BAD_RESPONSE, "Output budget consumed by reasoning", undefined,
        "The model used its whole output budget on hidden reasoning and returned no answer. " +
          "Pick a non-reasoning or \"flash\" model, or raise \"Max output tokens\" in settings.");
    }
    throw new QuizKeyError(ErrorCodes.API_BAD_RESPONSE, "Empty completion content", undefined,
      `The model${reply?.model ? ` "${reply.model}"` : ""} returned an empty reply. Make sure it is a vision-capable chat model.`);
  }

  const parsed = looseJsonParse(raw);

  // Graceful fallback: prose instead of the schema → low-confidence answer.
  if (!parsed || (parsed.question == null && parsed.answerText == null && parsed.answers == null)) {
    const prose = raw.replace(JSON_FENCE, "$1").trim();
    return {
      question: null,
      answers: [],
      inputKind: "text",
      correctAnswerId: null,
      answerText: prose.slice(0, 500),
      confidence: 0.3,
      explanation: "The model couldn't read a clear question — its best-effort answer is shown.",
      receivedAt: Date.now(),
    };
  }

  const answers = Array.isArray(parsed.answers)
    ? parsed.answers
        .filter((a) => a && typeof a === "object")
        .map((a, i) => ({ id: String(a.id ?? String.fromCharCode(65 + i)), text: String(a.text ?? "") }))
        .filter((a) => a.text.length > 0)
    : [];

  const result = {
    question: parsed.question ? String(parsed.question) : null,
    answers,
    inputKind: ["choice", "text", "none"].includes(parsed.inputKind) ? parsed.inputKind : "none",
    correctAnswerId: parsed.correctAnswerId != null ? String(parsed.correctAnswerId) : null,
    answerText: parsed.answerText != null ? String(parsed.answerText) : null,
    confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0)),
    explanation: parsed.explanation ? String(parsed.explanation) : "",
    receivedAt: Date.now(),
  };

  // Tolerate models that fill answerText but forget inputKind.
  if (result.inputKind === "none" && (result.answerText || result.correctAnswerId)) {
    result.inputKind = result.correctAnswerId && answers.length ? "choice" : "text";
  }
  // Fill answerText for MCQ when the model only gave the id.
  if (result.inputKind === "choice" && !result.answerText && result.correctAnswerId) {
    const hit = answers.find((a) => a.id === result.correctAnswerId);
    if (hit) result.answerText = `${hit.id}. ${hit.text}`;
  }

  if (!result.question) throw new QuizKeyError(ErrorCodes.NO_QUESTION, result.explanation || "");
  if (result.inputKind === "none" || (!result.answerText && !result.correctAnswerId)) {
    throw new QuizKeyError(ErrorCodes.NO_ANSWER, result.explanation || "");
  }
  return result;
}
