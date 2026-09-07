/**
 * content/typing-simulator.js
 * Replays an answer as a realistic stream of keyboard events — never a
 * paste. Every character dispatches the same sequence a physical keyboard
 * produces: keydown → keypress → beforeinput → (value mutation) → input →
 * keyup, with a human cadence (base delay + jitter, longer pauses between
 * words and after punctuation). The native value setter is used so
 * React/Vue/Angular controlled fields accept the input.
 */
(function registerTypingSimulator() {
  "use strict";
  window.QuizKey = window.QuizKey || {};

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (n) => Math.floor(Math.random() * (n + 1));

  const KEY_CODES = {
    " ": { code: "Space", keyCode: 32 },
    "\n": { code: "Enter", keyCode: 13 },
    "\t": { code: "Tab", keyCode: 9 },
  };

  function keyMeta(char) {
    if (KEY_CODES[char]) return KEY_CODES[char];
    const upper = char.length === 1 ? char.toUpperCase() : char;
    return {
      code: /^[A-Z0-9]$/.test(upper)
        ? (/[A-Z]/.test(upper) ? "Key" : "Digit") + upper
        : `Char${upper}`,
      keyCode: char.length === 1 ? char.charCodeAt(0) : 0,
    };
  }

  function dispatchKey(target, type, char) {
    const meta = keyMeta(char);
    const event = new KeyboardEvent(type, {
      key: char === "\n" ? "Enter" : char,
      code: meta.code,
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    // keyCode/which are read-only — define them for legacy listeners.
    Object.defineProperty(event, "keyCode", { get: () => meta.keyCode });
    Object.defineProperty(event, "which", { get: () => meta.keyCode });
    target.dispatchEvent(event);
    return event;
  }

  function dispatchInputEvent(target, type, char) {
    let event;
    if (typeof InputEvent === "function") {
      event = new InputEvent(type, {
        data: char === "\n" ? null : char,
        inputType: char === "\n" ? "insertLineBreak" : "insertText",
        bubbles: true,
        cancelable: type === "beforeinput",
        composed: true,
      });
    } else {
      event = new Event(type, { bubbles: true, cancelable: type === "beforeinput" });
    }
    target.dispatchEvent(event);
    return event;
  }

  /** Set value through the native setter so framework state stays in sync. */
  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
    if (descriptor && descriptor.set) descriptor.set.call(el, value);
    else el.value = value;
  }

  function insertChar(el, char) {
    if (el.isContentEditable) {
      // execCommand keeps rich-text editors happy; fall back to text mutation.
      const ok = document.execCommand?.("insertText", false, char);
      if (!ok) el.textContent = (el.textContent || "") + char;
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, start) + char + el.value.slice(end);
    setNativeValue(el, next);
    const caret = start + char.length;
    try {
      el.setSelectionRange(caret, caret);
    } catch (_) {
      /* number inputs expose no selection API */
    }
  }

  /** Human-ish pacing — longer between words, after commas & sentence ends. */
  function charDelay(char, { delayMs, jitterMs }) {
    let d = delayMs + rand(Math.max(0, jitterMs));
    if (char === " ") d *= 1.6;
    else if (",;:".includes(char)) d *= 1.9;
    else if (".!?".includes(char)) d *= 2.3;
    return Math.round(d);
  }

  /**
   * Type `text` into `el` character by character.
   * @param {HTMLElement} el
   * @param {string} text
   * @param {{ delayMs?: number, jitterMs?: number, onProgress?: (done:number,total:number)=>void }} [opts]
   */
  async function typeText(el, text, opts = {}) {
    const { delayMs = 60, jitterMs = 45, onProgress } = opts;
    if (!el || typeof text !== "string") return false;

    el.scrollIntoView?.({ behavior: "smooth", block: "center" });
    await sleep(180);
    el.focus({ preventScroll: true });
    if (el.isContentEditable) window.getSelection()?.selectAllChildren(el);
    el.click?.();

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      const down = dispatchKey(el, "keydown", char);
      if (down.defaultPrevented) {
        await sleep(charDelay(char, { delayMs, jitterMs }));
        continue; // the page vetoed this key — move on like a real typist would notice
      }
      dispatchKey(el, "keypress", char);
      const before = dispatchInputEvent(el, "beforeinput", char);

      if (!before.defaultPrevented) {
        insertChar(el, char);
        dispatchInputEvent(el, "input", char); // frameworks listen here
      }
      dispatchKey(el, "keyup", char);

      onProgress?.(i + 1, text.length);
      await sleep(charDelay(char, { delayMs, jitterMs }));
    }
    return true;
  }

  /**
   * Click a detected choice element with the full pointer/mouse sequence
   * pages expect (hover + down + up + click), not a bare programmatic click.
   */
  async function clickElement(el) {
    if (!el) return false;
    el.scrollIntoView?.({ behavior: "smooth", block: "center" });
    await sleep(200);
    const rect = el.getBoundingClientRect();
    const point = {
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    };
    const common = { bubbles: true, cancelable: true, composed: true, view: window, ...point };
    el.dispatchEvent(new PointerEvent("pointerover", common));
    el.dispatchEvent(new MouseEvent("mouseover", common));
    await sleep(60 + rand(80));
    el.dispatchEvent(new PointerEvent("pointerdown", common));
    el.dispatchEvent(new MouseEvent("mousedown", common));
    await sleep(40 + rand(60));
    el.dispatchEvent(new PointerEvent("pointerup", common));
    el.dispatchEvent(new MouseEvent("mouseup", common));
    el.dispatchEvent(new MouseEvent("click", common));
    return true;
  }

  window.QuizKey.TypingSimulator = Object.freeze({ typeText, clickElement, setNativeValue });
})();
