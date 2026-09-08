/**
 * content/overlay.js
 * Minimal, self-healing in-page status UI. Renders the pipeline state,
 * the detected question/answer, typing progress and error toasts.
 * All styles live in overlay.css and are namespaced with `qk-` so host
 * pages can't accidentally style the overlay (and vice-versa).
 */
(function registerOverlay() {
  "use strict";
  window.QuizKey = window.QuizKey || {};

  const ROOT_ID = "quizkey-overlay-root";
  let position = "top-right";
  let themeMode = "auto";
  let dismissTimer = null;

  const lightQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;
  const resolveTheme = (mode) =>
    mode === "dark" || mode === "light" ? mode : lightQuery && lightQuery.matches ? "light" : "dark";
  lightQuery?.addEventListener?.("change", () => {
    if (themeMode === "auto") document.getElementById(ROOT_ID)?.setAttribute("data-theme", resolveTheme(themeMode));
  });

  function ensureRoot() {
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement("div");
      root.id = ROOT_ID;
      root.setAttribute("data-pos", position);
      root.setAttribute("data-theme", resolveTheme(themeMode));
      document.documentElement.appendChild(root);
    }
    return root;
  }

  function clear() {
    const root = document.getElementById(ROOT_ID);
    if (root) root.innerHTML = "";
    if (dismissTimer) clearTimeout(dismissTimer);
  }

  function autoDismiss(ms) {
    if (dismissTimer) clearTimeout(dismissTimer);
    dismissTimer = setTimeout(clear, ms);
  }

  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };

  /* ---------------------------------------------------------------- */

  /** Compact pipeline status chip. @param {"working"|"success"|"error"} tone */
  function showStatus(headline, detail = "", tone = "working") {
    const root = ensureRoot();
    root.innerHTML = "";
    const card = el("div", `qk-card qk-card-${tone}`);
    const row = el("div", "qk-card-row");
    row.appendChild(el("span", `qk-dot qk-dot-${tone}`));
    const col = el("div", "qk-card-text");
    col.appendChild(el("p", "qk-card-title", headline));
    if (detail) col.appendChild(el("p", "qk-card-detail", detail));
    row.appendChild(col);
    card.appendChild(row);
    root.appendChild(card);
  }

  /** Full analysis result panel with answer + confidence + actions. */
  function showAnalysis(analysis, { onType, busy = false } = {}) {
    const root = ensureRoot();
    root.innerHTML = "";

    const card = el("div", "qk-card qk-card-analysis");
    card.appendChild(el("p", "qk-eyebrow", "Question detected"));

    if (analysis.question) card.appendChild(el("p", "qk-question", analysis.question));

    const best =
      analysis.inputKind === "choice"
        ? `${analysis.correctAnswerId ?? ""}. ${analysis.answers?.find?.((a) => a.id === analysis.correctAnswerId)?.text || analysis.answerText || ""}`.trim()
        : analysis.answerText;

    const answerBox = el("div", "qk-answer");
    answerBox.appendChild(el("span", "qk-answer-label", "Best answer"));
    answerBox.appendChild(el("span", "qk-answer-text", best || "—"));
    card.appendChild(answerBox);

    const confRow = el("div", "qk-conf");
    const track = el("div", "qk-conf-track");
    const fill = el("div", "qk-conf-fill");
    fill.style.width = `${Math.round((analysis.confidence || 0) * 100)}%`;
    track.appendChild(fill);
    confRow.appendChild(track);
    confRow.appendChild(el("span", "qk-conf-num", `${Math.round((analysis.confidence || 0) * 100)}%`));
    card.appendChild(confRow);

    if (analysis.explanation) card.appendChild(el("p", "qk-explain", analysis.explanation));

    const actions = el("div", "qk-actions");
    const typeBtn = el("button", "qk-btn", busy ? "Typing…" : "Type answer  ⌥A");
    typeBtn.disabled = busy;
    typeBtn.addEventListener("click", () => onType?.());
    const closeBtn = el("button", "qk-btn qk-btn-ghost", "Dismiss");
    closeBtn.addEventListener("click", clear);
    actions.appendChild(typeBtn);
    actions.appendChild(closeBtn);
    card.appendChild(actions);

    root.appendChild(card);
  }

  /** Typing progress bar that fills up as characters land. */
  function showTypingProgress(done, total) {
    showStatus(`Typing answer…`, `${done} / ${total} characters`, "working");
    const track = el("div", "qk-conf-track qk-progress");
    const fill = el("div", "qk-conf-fill");
    fill.style.width = `${Math.round((done / Math.max(1, total)) * 100)}%`;
    track.appendChild(fill);
    document.querySelector(`#${ROOT_ID} .qk-card`)?.appendChild(track);
  }

  /** Toast notification. @param {"info"|"success"|"error"} tone */
  function showToast(message, tone = "info", ms = 4200) {
    const root = ensureRoot();
    const icon = tone === "error" ? "!" : tone === "success" ? "✓" : "i";
    const toast = el("div", `qk-toast qk-toast-${tone}`);
    toast.appendChild(el("span", "qk-toast-icon", icon));
    toast.appendChild(el("span", "qk-toast-text", message));
    toast.addEventListener("click", () => toast.remove());
    root.appendChild(toast);
    setTimeout(() => toast.remove(), ms);
  }

  window.QuizKey.Overlay = Object.freeze({
    clear,
    showStatus,
    showAnalysis,
    showTypingProgress,
    showToast,
    setPosition: (pos) => {
      position = pos;
      document.getElementById(ROOT_ID)?.setAttribute("data-pos", pos);
    },
    /** @param {"auto"|"dark"|"light"} mode */
    setTheme: (mode) => {
      themeMode = mode || "auto";
      document.getElementById(ROOT_ID)?.setAttribute("data-theme", resolveTheme(themeMode));
    },
  });
})();
