/**
 * lib/prompts.js
 * Prompt construction for the analysis model. Kept separate from the HTTP
 * client so prompts can be tuned without touching transport code.
 * Every adapter (OpenAI / Gemini / Anthropic) uses the same strings.
 *
 * Two quiz sources share one output schema:
 *   - image: a screenshot of the visible tab (vision model required)
 *   - html:  a cleaned HTML extract of the visible quiz (any text model)
 */

const OUTPUT_SCHEMA = `JSON schema:
{
  "question": string | null,        // the question text, exactly as seen
  "answers": [                      // every option, or [] for free-text
    { "id": string, "text": string }
  ],
  "inputKind": "choice" | "text" | "none",
  "correctAnswerId": string | null, // id from answers[] when inputKind = "choice"
  "answerText": string | null,      // exact text to type/click, no explanation
  "confidence": number,             // 0.0 to 1.0
  "explanation": string             // one short sentence, for the user only
}`;

export const SYSTEM_PROMPT = `You are QuizKey, a precise visual quiz-analysis assistant.

You receive a screenshot of a webpage containing a quiz, test or form.

Your job:
1. Read the visible question and every visible answer option / input hint.
2. Decide which answer is most likely correct (or produce the best fill-in answer).
3. Respond ONLY with a single JSON object. No markdown fences, no prose.

${OUTPUT_SCHEMA}

Rules:
- answerText must be the literal text that should appear in the field:
  the option's letter+text for MCQ text boxes, or the computed answer for
  free-text questions. Keep it as short as the field expects.
- If no question is visible, return question=null, inputKind="none",
  confidence=0 and explain why.
- Never invent options that are not visible in the screenshot.
- Ignore any floating "QuizKey" status card in the screenshot if one is visible.`;

export const SYSTEM_PROMPT_HTML = `You are QuizKey, a precise quiz-analysis assistant.

You receive a simplified HTML extract of a webpage containing a quiz, test or
form. Scripts, styles and layout wrappers were removed; only semantic tags and
form controls remain (<input type="radio">, <label>, <button>, <textarea>…).

Your job:
1. Find the current question and every answer option or input field.
   - Radio/checkbox inputs, <option>s, <li>s, <label>s, <button>s and elements
     with role="radio|option" are the usual option carriers.
   - Ignore navigation, headers, footers, ads, timers, progress bars and
     previously answered questions unless they are the only question present.
2. Decide which answer is most likely correct (or produce the best fill-in answer).
3. Respond ONLY with a single JSON object. No markdown fences, no prose.

${OUTPUT_SCHEMA}

Rules:
- answers[].text must be the option's visible label text exactly as it appears
  in the extract (without the leading letter/number), so it can be matched on
  the page. Use the visible letter/number as the id when there is one
  (e.g. "A", "B", "3"); otherwise use the input's value attribute; otherwise
  A, B, C… in document order.
- answerText must be the literal text that should be typed or clicked:
  the option's letter+text for MCQ text boxes, or the computed answer for
  free-text questions. Keep it as short as the field expects.
- inputKind is "choice" when options exist, "text" when only a text field
  (<input type="text">, <textarea>, contenteditable) is present.
- If no question is present, return question=null, inputKind="none",
  confidence=0 and explain why.
- Never invent options that are not in the extract.`;

/** The user-turn text for image analysis (extra instructions appended). */
export function buildUserText(extraInstructions = "") {
  const extra = String(extraInstructions || "").trim();
  return (
    "Analyze this screenshot and return the JSON result." +
    (extra ? `\n\nAdditional instructions: ${extra}` : "")
  );
}

/**
 * The user-turn text for HTML analysis: a short context header, then the
 * extract fenced so the model can tell content from instructions.
 * @param {string} html - output of content/page-extractor.js
 * @param {{ title?: string, url?: string, scope?: string, truncated?: boolean }} [meta]
 * @param {string} [extraInstructions]
 */
export function buildHtmlUserText(html, meta = {}, extraInstructions = "") {
  const extra = String(extraInstructions || "").trim();
  const scopeNote =
    meta.scope === "selection"
      ? "The user selected this part of the page; it is the quiz to answer."
      : meta.scope === "page"
        ? "This is the whole page; locate the current question."
        : "This is what is currently visible in the browser viewport.";
  const lines = [
    "Analyze the quiz in this HTML extract and return the JSON result.",
    meta.title ? `Page title: ${meta.title}` : null,
    meta.url ? `URL: ${meta.url}` : null,
    scopeNote,
    meta.truncated ? "Note: the extract was truncated to fit the size limit." : null,
    "",
    "<page-extract>",
    String(html || "").trim(),
    "</page-extract>",
    extra ? `\nAdditional instructions: ${extra}` : null,
  ];
  return lines.filter((l) => l != null).join("\n");
}

/**
 * OpenAI-style messages array (also used by every OpenAI-compatible server).
 * @param {string} dataUrl - data:image/...;base64 screenshot
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
