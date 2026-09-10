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

  /* ---------------------------------------------------------------- */
  /* Always on top                                                      */
  /*                                                                    */
  /* 1. The root is a `popover="manual"` element. Open popovers live in */
  /*    the browser's *top layer*, which renders above every z-index on */
  /*    the page — including <dialog> modals and the page's own         */
  /*    popovers. Re-opening it moves it to the front of that layer.    */
  /* 2. A MutationObserver re-attaches the root if a page script        */
  /*    removes it and keeps it the last child of <html>, so the        */
  /*    z-index fallback (max int) also wins in older browsers.         */
  /* ---------------------------------------------------------------- */
  const supportsPopover =
    typeof HTMLElement !== "undefined" && typeof HTMLElement.prototype.showPopover === "function";
  let guard = null;
  let raising = false;

  function isOpen(root) {
    try {
      return supportsPopover && root.matches(":popover-open");
    } catch (_) {
      return false;
    }
  }

  /** Bring the root to the very front (top layer + last DOM child). */
  function raise(root) {
    if (raising) return;
    raising = true;
    try {
      const html = document.documentElement;
      if (root.parentNode !== html || html.lastElementChild !== root) {
        html.appendChild(root); // (re)attach — also moves it after any newer siblings
      }
      if (supportsPopover) {
        if (root.getAttribute("popover") !== "manual") root.setAttribute("popover", "manual");
        try {
          if (isOpen(root)) root.hidePopover(); // re-show = move to the top of the top layer
          root.showPopover();
        } catch (_) {
          /* not connected yet or already open — ignore */
        }
      }
    } finally {
      raising = false;
    }
  }

  /** Watch for hostile pages that remove or bury the overlay. */
  function startGuard(root) {
    if (guard || typeof MutationObserver === "undefined") return;
    guard = new MutationObserver(() => {
      if (raising) return;
      const live = document.getElementById(ROOT_ID);
      if (!live || live !== root) {
        // Someone removed our node: put it back with its content intact.
        if (!root.isConnected && root.childElementCount) raise(root);
        return;
      }
      if (root.id !== ROOT_ID) root.id = ROOT_ID;
      const buried = document.documentElement.lastElementChild !== root;
      const closed = root.childElementCount > 0 && supportsPopover && !isOpen(root);
      const tampered = supportsPopover && root.getAttribute("popover") !== "manual";
      if (buried || closed || tampered) raise(root);
    });
    guard.observe(document.documentElement, { childList: true });
    guard.observe(root, { attributes: true, attributeFilter: ["id", "popover", "style", "class"] });

    // Fullscreen elements enter the top layer above us — climb back on top.
    document.addEventListener("fullscreenchange", () => {
      if (root.childElementCount) raise(root);
    });
  }

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
      root.setAttribute("role", "region");
      root.setAttribute("aria-label", "QuizKey");
      if (supportsPopover) root.setAttribute("popover", "manual");
      document.documentElement.appendChild(root);
      startGuard(root);
    }
    raise(root);
    return root;
  }

  function clear() {
    const root = document.getElementById(ROOT_ID);
    if (root) {
      root.innerHTML = "";
      if (isOpen(root)) {
        try {
          root.hidePopover(); // leave the top layer when there is nothing to show
        } catch (_) {
          /* ignore */
        }
      }
    }
    if (dismissTimer) clearTimeout(dismissTimer);
  }

  /** Close (×) button shared by cards and toasts. */
  function closeButton(onClose) {
    const btn = el("button", "qk-close", "×");
    btn.type = "button";
    btn.setAttribute("aria-label", "Close");
    btn.title = "Close";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onClose();
    });
    return btn;
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
    card.appendChild(closeButton(clear));
    root.appendChild(card);
  }

  /** Full analysis result panel with answer + confidence + actions. */
  function showAnalysis(analysis, { onType, busy = false } = {}) {
    const root = ensureRoot();
    root.innerHTML = "";

    const card = el("div", "qk-card qk-card-analysis");
    card.appendChild(closeButton(clear));
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
    actions.appendChild(typeBtn);
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
    toast.setAttribute("role", tone === "error" ? "alert" : "status");
    const timer = setTimeout(remove, ms);
    function remove() {
      clearTimeout(timer);
      toast.remove();
      // Nothing left? Step out of the top layer.
      if (root.childElementCount === 0 && isOpen(root)) {
        try {
          root.hidePopover();
        } catch (_) {
          /* ignore */
        }
      }
    }
    toast.appendChild(closeButton(remove));
    root.appendChild(toast);
  }

  // Esc while a QuizKey control is focused closes the overlay (never steals
  // Esc from the page otherwise).
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const root = document.getElementById(ROOT_ID);
    if (root && root.contains(document.activeElement)) {
      e.stopPropagation();
      clear();
    }
  });

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
