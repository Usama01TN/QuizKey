/**
 * content/content-script.js
 * Thin message router that wires the background worker to the three DOM
 * modules (DOMDetector, TypingSimulator, Overlay) and keeps the answer
 * state local to the tab. It owns no business logic itself.
 */
(function registerContentScript() {
  "use strict";

  // Guard against double injection (e.g. after BFCache restores).
  if (window.__QUIZKEY_INJECTED__) return;
  window.__QUIZKEY_INJECTED__ = true;

  const { DOMDetector, TypingSimulator, Overlay } = window.QuizKey || {};

  if (!DOMDetector || !TypingSimulator || !Overlay) {
    console.error("[QuizKey] A content module failed to load — check manifest script order.");
    return;
  }

  /** @type {{ analysis: object, settings: object } | null} */
  let pendingAnswer = null;
  let typing = false;

  function rememberAnalysis(analysis, settings) {
    pendingAnswer = { analysis, settings };
    Overlay.setPosition(settings.overlayPosition || "top-right");
    Overlay.setTheme(settings.theme || "auto");

    if (settings.highlightMatches) {
      const q = DOMDetector.findQuestionNode(analysis);
      if (q) DOMDetector.highlight(q, "question");
    }
    Overlay.showAnalysis(analysis, { onType: () => void typePendingAnswer() });
  }

  async function typePendingAnswer() {
    if (!pendingAnswer) {
      Overlay.showToast("Nothing to type yet — capture the page first.", "info");
      chrome.runtime.sendMessage({ type: "QUIZKEY_LOOKUP_RESULT" }).catch(() => {});
      return;
    }
    if (typing) return;

    const { analysis, settings } = pendingAnswer;
    typing = true;

    try {
      // Choice answers: click the detected option with real pointer events.
      if (analysis.inputKind === "choice" && settings.clickChoice) {
        const choice = DOMDetector.findChoiceElement(analysis);
        if (choice) {
          if (settings.highlightMatches) DOMDetector.highlight(choice, "answer");
          await TypingSimulator.clickElement(choice);
          Overlay.showToast("Answer selected.", "success", 2500);
          return;
        }
        // No clickable option matched — fall through to typing the text.
      }

      const field = DOMDetector.findInputField();
      const text = analysis.answerText || "";
      if (!field || !text) {
        Overlay.showToast(
          !text
            ? "The analysis contained no text to type."
            : "No visible, editable input field found. Focus the field and try again.",
          "error",
          6000
        );
        // Graceful fallback: leave the answer visible in the overlay.
        Overlay.showAnalysis(analysis, { onType: () => void typePendingAnswer() });
        return;
      }

      if (settings.highlightMatches) DOMDetector.highlight(field, "answer", 1200);

      await TypingSimulator.typeText(field, text, {
        delayMs: settings.typingDelayMs,
        jitterMs: settings.typingJitterMs,
        onProgress: (done, total) => Overlay.showTypingProgress(done, total),
      });

      Overlay.showStatus("Answer typed", field.name ? `into “${field.name}”` : "", "success");
      setTimeout(() => Overlay.clear(), 2200);
    } catch (err) {
      console.error("[QuizKey] Typing failed:", err);
      Overlay.showToast("The answer could not be typed into this page.", "error", 5200);
    } finally {
      typing = false;
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch (message?.type) {
      case "QUIZKEY_PING":
        sendResponse({ ok: true, hasResult: Boolean(pendingAnswer), url: location.href });
        return false;

      case "QUIZKEY_HIDE_OVERLAY":
        // The worker is about to screenshot the tab — nothing of ours may
        // be in the picture (a previous answer card would mislead the model).
        Overlay.clear();
        DOMDetector.clearHighlights();
        sendResponse({ ok: true });
        return false;

      case "QUIZKEY_SHOW_STATUS":
        Overlay.setPosition(message.position || "top-right");
        if (message.theme) Overlay.setTheme(message.theme);
        Overlay.showStatus(message.headline, message.detail, message.tone || "working");
        sendResponse({ ok: true });
        return false;

      case "QUIZKEY_ANALYSIS":
        rememberAnalysis(message.analysis, message.settings);
        sendResponse({ ok: true });
        return false;

      case "QUIZKEY_RESTORE_RESULT":
        // Background pushed a stored result (e.g. popup re-opened).
        if (message.analysis && message.settings) {
          pendingAnswer = { analysis: message.analysis, settings: message.settings };
          Overlay.setTheme(message.settings.theme || "auto");
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false });
        }
        return false;

      case "QUIZKEY_TYPE_ANSWER":
        if (message.analysis && message.settings) {
          pendingAnswer = { analysis: message.analysis, settings: message.settings };
          Overlay.setTheme(message.settings.theme || "auto");
        }
        sendResponse({ ok: true });
        void typePendingAnswer();
        return false;

      case "QUIZKEY_ERROR":
        Overlay.showToast(
          message.error?.userMessage || "Something went wrong.",
          "error",
          6500
        );
        sendResponse({ ok: true });
        return false;

      default:
        return false;
    }
  });
})();
