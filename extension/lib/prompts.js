/**
 * lib/prompts.js
 * Prompt construction for the vision model. Kept separate from the HTTP
 * client so prompts can be tuned without touching transport code.
 * Every adapter (OpenAI / Gemini / Anthropic) uses the same two strings.
 */

export const SYSTEM_PROMPT = `You are QuizKey, a precise visual quiz-analysis assistant.

You receive a screenshot of a webpage containing a quiz, test or form.

Your job:
1. Read the visible question and every visible answer option / input hint.
2. Decide which answer is most likely correct (or produce the best fill-in answer).
3. Respond ONLY with a single JSON object — no markdown fences, no prose.

JSON schema:
{
  "question": string | null,        // the question text, exactly as seen
  "answers": [                      // every visible option, or [] for free-text
    { "id": string, "text": string }
  ],
  "inputKind": "choice" | "text" | "none",
  "correctAnswerId": string | null, // id from answers[] when inputKind = "choice"
  "answerText": string | null,      // exact text to type/click, no explanation
  "confidence": number,             // 0.0 – 1.0
  "explanation": string             // one short sentence, for the user only
}

Rules:
- answerText must be the literal text that should appear in the field:
  the option's letter+text for MCQ text boxes, or the computed answer for
  free-text questions. Keep it as short as the field expects.
- If no question is visible, return question=null, inputKind="none",
  confidence=0 and explain why.
- Never invent options that are not visible in the screenshot.
- Ignore any floating "QuizKey" status card in the screenshot if one is visible.`;

/** The user-turn text (extra instructions appended). */
export function buildUserText(extraInstructions = "") {
  const extra = String(extraInstructions || "").trim();
  return (
    "Analyze this screenshot and return the JSON result." +
    (extra ? `\n\nAdditional instructions: ${extra}` : "")
  );
}

/**
 * OpenAI-style messages array (also used by every OpenAI-compatible server).
 * @param {string} dataUrl — data:image/...;base64 screenshot
 * @param {string} [extraInstructions]
 */
export function buildAnalysisMessages(dataUrl, extraInstructions = "") {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        { type: "text", text: buildUserText(extraInstructions) },
        { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
      ],
    },
  ];
}
