/**
 * content/dom-detector.js
 * Locates the quiz question, the answer options and — most importantly —
 * the editable field that should receive the typed answer.
 *
 * Content scripts can't use ES module imports, so every content module
 * registers itself on the shared `window.QuizKey` namespace. Load order is
 * fixed in manifest.json.
 */
(function registerDOMDetector() {
  "use strict";
  window.QuizKey = window.QuizKey || {};

  const TEXT_INPUT_SELECTOR = [
    'input[type="text"]',
    'input[type="search"]',
    'input[type="email"]',
    'input[type="url"]',
    'input[type="number"]',
    'input[type="tel"]',
    "input:not([type])",
    "textarea",
    '[contenteditable="true"]',
    '[role="textbox"]',
  ].join(", ");

  const CHOICE_SELECTOR = [
    'button',
    'label',
    'li',
    '[role="radio"]',
    '[role="checkbox"]',
    '[role="option"]',
    '.answer',
    '.option',
    '[class*="answer"]',
    '[class*="option"]',
  ].join(", ");

  const QUESTION_HINTS = /question|prompt|title|heading|quiz/i;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const isVisible = (el) => {
    if (!el || !(el instanceof Element)) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const isEditable = (el) => {
    if (!isVisible(el)) return false;
    if (el.isContentEditable) return !el.closest('[contenteditable="false"]');
    return !el.disabled && !el.readOnly && el.getAttribute("aria-disabled") !== "true";
  };

  const norm = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();

  /** Find the most likely editable target for the answer. */
  function findInputField() {
    // 1. The element the user already focused is the strongest signal.
    const active = document.activeElement;
    if (
      active &&
      active !== document.body &&
      (active.matches?.(TEXT_INPUT_SELECTOR) || active.isContentEditable) &&
      isEditable(active)
    ) {
      return active;
    }

    // 2. Otherwise score every candidate by context clues.
    const candidates = Array.from(document.querySelectorAll(TEXT_INPUT_SELECTOR)).filter(isEditable);
    if (!candidates.length) return null;

    const score = (el) => {
      let s = 0;
      const haystack = norm(
        [
          el.getAttribute("placeholder"),
          el.getAttribute("aria-label"),
          el.getAttribute("name"),
          el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent,
          el.closest("label")?.textContent,
        ]
          .filter(Boolean)
          .join(" ")
      );
      if (/answer|response|reply|solution/.test(haystack)) s += 40;
      if (/your|type|enter|write/.test(haystack)) s += 15;
      if (el.tagName === "TEXTAREA" || el.isContentEditable) s += 5;
      const rect = el.getBoundingClientRect();
      if (rect.top >= 0 && rect.bottom <= window.innerHeight) s += 10; // in viewport
      const nearestQ = el.closest("form, section, article, div, main");
      if (nearestQ && QUESTION_HINTS.test(nearestQ.className + " " + nearestQ.id)) s += 10;
      return s;
    };

    return candidates.sort((a, b) => score(b) - score(a))[0];
  }

  /**
   * Find the on-page element representing a choice answer, using the
   * analysis' option id and text with fuzzy normalization.
   */
  function findChoiceElement(analysis) {
    if (!analysis || analysis.inputKind !== "choice") return null;
    const wantedId = norm(analysis.correctAnswerId);
    const wantedText = norm(
      analysis.answers?.find((a) => norm(a.id) === wantedId)?.text || analysis.answerText
    );
    if (!wantedText && !wantedId) return null;

    let best = null;
    let bestScore = 0;
    for (const el of Array.from(document.querySelectorAll(CHOICE_SELECTOR))) {
      if (!isVisible(el)) continue;
      const text = norm(el.innerText || el.textContent);
      if (!text || text.length > 300) continue;

      let s = 0;
      if (wantedText) {
        if (text === wantedText) s = 100;
        else if (text.includes(wantedText)) s = 75;
        else if (wantedText.includes(text) && text.length > 3) s = 55;
      }
      if (!s && wantedId && new RegExp(`^\\(?${wantedId}\\)?[.:\\s-]`).test(text)) s = 60;
      if (s > bestScore) {
        bestScore = s;
        best = el;
      }
    }
    return best;
  }

  /** Best-effort question region for visual highlighting. */
  function findQuestionNode(analysis) {
    if (!analysis?.question) return null;
    const needle = norm(analysis.question).split(" ").filter(Boolean).slice(0, 6).join(" ");
    if (!needle) return null;
    for (const el of Array.from(document.querySelectorAll("h1,h2,h3,h4,p,legend,strong,div"))) {
      if (!isVisible(el) || el.children.length > 6) continue;
      const text = norm(el.innerText || el.textContent);
      if (text.includes(needle)) return el;
    }
    return null;
  }

  /** Outline a node briefly + scroll it into view. */
  function highlight(el, kind = "answer", durationMs = 2600) {
    if (!el || !(el instanceof Element)) return;
    el.classList.add(kind === "question" ? "quizkey-hl-question" : "quizkey-hl-answer");
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    sleep(durationMs).then(() => {
      el.classList.remove("quizkey-hl-question", "quizkey-hl-answer");
    });
  }

  /** Remove every QuizKey outline immediately (used right before capture). */
  function clearHighlights() {
    document
      .querySelectorAll(".quizkey-hl-question, .quizkey-hl-answer")
      .forEach((n) => n.classList.remove("quizkey-hl-question", "quizkey-hl-answer"));
  }

  window.QuizKey.DOMDetector = Object.freeze({
    findInputField,
    clearHighlights,
    findChoiceElement,
    findQuestionNode,
    highlight,
    isVisible,
    isEditable,
  });
})();
