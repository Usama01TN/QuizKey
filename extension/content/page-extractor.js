/**
 * content/page-extractor.js
 * "HTML" quiz source: instead of a screenshot, serialize the quiz that is
 * on screen into a compact, cleaned-up HTML snippet the model can read as
 * text. Only semantic tags and a handful of attributes survive — no
 * scripts, styles, wrappers, ids, classes or tracking noise — so a whole
 * quiz screen usually fits in a few thousand characters.
 *
 * Scope rules (in priority order):
 *   1. The user's text selection (≥ 15 chars) — "analyze exactly this".
 *   2. `scope: "viewport"` — every element that intersects the visible
 *      viewport, i.e. what the screenshot would have shown.
 *   3. `scope: "page"` — the whole document body.
 *
 * Content scripts can't use ES module imports, so this module registers
 * itself on `window.QuizKey.PageExtractor`.
 */
(function registerPageExtractor() {
  "use strict";
  window.QuizKey = window.QuizKey || {};

  const OVERLAY_ID = "quizkey-overlay-root";
  const MIN_SELECTION_CHARS = 15;
  const DEFAULT_MAX_CHARS = 12000;

  /** Never descend into these. */
  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "IFRAME", "OBJECT", "EMBED",
    "CANVAS", "VIDEO", "AUDIO", "LINK", "META", "HEAD", "MAP", "PICTURE", "SOURCE",
  ]);

  /** Tags emitted as markup. Everything else is transparent (children only). */
  const KEEP_TAGS = new Set([
    "H1", "H2", "H3", "H4", "H5", "H6", "P", "UL", "OL", "LI", "DL", "DT", "DD",
    "LABEL", "LEGEND", "FIELDSET", "TABLE", "THEAD", "TBODY", "TR", "TD", "TH",
    "BUTTON", "SELECT", "OPTION", "TEXTAREA", "INPUT", "IMG", "PRE", "CODE",
    "BLOCKQUOTE", "STRONG", "EM", "B", "I", "U", "SUP", "SUB", "BR", "HR",
  ]);

  /** Block-ish tags get their own line so the output stays readable. */
  const BLOCK_TAGS = new Set([
    "H1", "H2", "H3", "H4", "H5", "H6", "P", "UL", "OL", "LI", "DL", "DT", "DD",
    "LEGEND", "FIELDSET", "TABLE", "THEAD", "TBODY", "TR", "PRE", "BLOCKQUOTE",
    "HR", "BR", "DIV", "SECTION", "ARTICLE", "MAIN", "FORM", "HEADER", "FOOTER",
    "NAV", "ASIDE", "TEXTAREA", "SELECT", "BUTTON", "LABEL", "IMG",
  ]);

  /** ARIA roles that turn a plain element into a meaningful control. */
  const KEEP_ROLES = new Set([
    "radio", "checkbox", "option", "button", "textbox", "heading", "listitem",
    "list", "radiogroup", "group", "switch", "menuitemradio", "menuitemcheckbox",
  ]);

  const INLINE_INPUT_TYPES = new Set(["hidden"]);
  const CHOICE_INPUT_TYPES = new Set(["radio", "checkbox"]);

  const esc = (s) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const collapse = (s) => String(s || "").replace(/\s+/g, " ");

  /* ---------------------------------------------------------------- */
  /* Visibility                                                          */
  /* ---------------------------------------------------------------- */

  function viewportRect() {
    return { top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth };
  }

  function intersects(a, b) {
    return a.bottom > b.top && a.top < b.bottom && a.right > b.left && a.left < b.right;
  }

  /**
   * Is this element rendered? Custom radio/checkbox widgets usually hide the
   * real input (display:none, opacity:0, off-screen) but the control is still
   * the thing that matters, so choice inputs bypass the visual check — they
   * are included whenever their parent is.
   */
  function isRendered(el, style) {
    if (el.tagName === "INPUT" && CHOICE_INPUT_TYPES.has(String(el.type).toLowerCase())) return true;
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (Number(style.opacity) === 0) return false;
    if (style.display === "contents") return true; // renders children, has no box itself
    return el.getClientRects().length > 0;
  }

  /* ---------------------------------------------------------------- */
  /* Attribute selection                                                 */
  /* ---------------------------------------------------------------- */

  function attrsFor(el) {
    const tag = el.tagName;
    const out = [];
    const add = (name, value) => {
      if (value == null || value === "" || value === false) return;
      out.push(value === true ? name : `${name}="${esc(collapse(value).trim().slice(0, 200))}"`);
    };

    const role = el.getAttribute("role");
    if (role && KEEP_ROLES.has(role)) {
      add("role", role);
      add("aria-checked", el.getAttribute("aria-checked"));
      add("aria-selected", el.getAttribute("aria-selected"));
      add("aria-disabled", el.getAttribute("aria-disabled"));
    }
    add("aria-label", el.getAttribute("aria-label"));
    if (el.isContentEditable && el.getAttribute("contenteditable") !== null) add("contenteditable", "true");

    if (tag === "INPUT") {
      const type = String(el.type || "text").toLowerCase();
      add("type", type);
      add("name", el.name);
      add("placeholder", el.placeholder);
      if (CHOICE_INPUT_TYPES.has(type)) {
        add("value", el.value);
        add("checked", Boolean(el.checked));
      } else if (["submit", "button", "reset"].includes(type)) {
        add("value", el.value);
      } else if (el.value) {
        add("value", el.value); // the user's current text, if any
      }
      add("disabled", Boolean(el.disabled));
    } else if (tag === "TEXTAREA") {
      add("name", el.name);
      add("placeholder", el.placeholder);
      add("disabled", Boolean(el.disabled));
    } else if (tag === "SELECT") {
      add("name", el.name);
      add("disabled", Boolean(el.disabled));
    } else if (tag === "OPTION") {
      add("value", el.value);
      add("selected", Boolean(el.selected));
    } else if (tag === "BUTTON") {
      add("type", el.type);
      add("disabled", Boolean(el.disabled));
    } else if (tag === "IMG") {
      add("alt", el.alt);
    } else if (tag === "TD" || tag === "TH") {
      if (el.colSpan > 1) add("colspan", String(el.colSpan));
    }
    return out.length ? " " + out.join(" ") : "";
  }

  /* ---------------------------------------------------------------- */
  /* Serializer                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * @param {Node} node
   * @param {{ filterViewport: boolean, vp: object, parts: string[], budget: {left:number, truncated:boolean}, inPre: boolean }} ctx
   */
  function walk(node, ctx) {
    if (ctx.budget.left <= 0) {
      ctx.budget.truncated = true;
      return;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      const text = ctx.inPre ? node.nodeValue : collapse(node.nodeValue);
      if (!text || (!ctx.inPre && !text.trim())) {
        if (text === " ") push(ctx, " ");
        return;
      }
      push(ctx, esc(text));
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = /** @type {Element} */ (node);
    const tag = el.tagName;

    if (SKIP_TAGS.has(tag) || el.id === OVERLAY_ID) return;
    if (tag === "INPUT" && INLINE_INPUT_TYPES.has(String(el.type).toLowerCase())) return;

    const style = window.getComputedStyle(el);
    if (!isRendered(el, style)) return;

    // Viewport scope: skip whole subtrees that are scrolled out of view.
    if (ctx.filterViewport) {
      const rect = el.getBoundingClientRect();
      const hasBox = rect.width > 0 || rect.height > 0;
      if (hasBox && !intersects(rect, ctx.vp)) return;
    }

    const isBlock = BLOCK_TAGS.has(tag) || style.display === "block" || style.display === "list-item" || style.display === "flex" || style.display === "grid" || style.display === "table" || style.display === "table-row";
    const role = el.getAttribute("role");
    const keep = KEEP_TAGS.has(tag) || (role && KEEP_ROLES.has(role)) || el.isContentEditable;

    if (tag === "IMG") {
      if (el.alt && el.alt.trim()) push(ctx, `\n<img alt="${esc(collapse(el.alt).trim().slice(0, 200))}">\n`);
      return;
    }
    if (tag === "BR") {
      push(ctx, "\n");
      return;
    }
    if (tag === "HR") {
      push(ctx, "\n<hr>\n");
      return;
    }
    if (tag === "INPUT") {
      push(ctx, `<input${attrsFor(el)}>`);
      if (isBlock) push(ctx, "\n");
      return;
    }
    if (tag === "TEXTAREA") {
      push(ctx, `\n<textarea${attrsFor(el)}>${esc(el.value || "")}</textarea>\n`);
      return;
    }
    if (tag === "SELECT") {
      push(ctx, `\n<select${attrsFor(el)}>`);
      for (const opt of Array.from(el.options)) {
        push(ctx, `<option${attrsFor(opt)}>${esc(collapse(opt.textContent).trim())}</option>`);
      }
      push(ctx, "</select>\n");
      return;
    }

    const name = keep ? (KEEP_TAGS.has(tag) ? tag.toLowerCase() : "div") : null;
    if (isBlock) push(ctx, "\n");
    if (name) push(ctx, `<${name}${attrsFor(el)}>`);

    const wasPre = ctx.inPre;
    if (tag === "PRE") ctx.inPre = true;

    // Shadow DOM (web-component quiz widgets) — read the rendered tree.
    const children = el.shadowRoot ? Array.from(el.shadowRoot.childNodes) : Array.from(el.childNodes);
    for (const child of children) {
      if (ctx.budget.left <= 0) break;
      walk(child, ctx);
    }
    ctx.inPre = wasPre;

    if (name) push(ctx, `</${name}>`);
    if (isBlock) push(ctx, "\n");
  }

  function push(ctx, chunk) {
    if (!chunk) return;
    if (chunk.length > ctx.budget.left) {
      chunk = chunk.slice(0, Math.max(0, ctx.budget.left));
      ctx.budget.truncated = true;
    }
    ctx.parts.push(chunk);
    ctx.budget.left -= chunk.length;
  }

  /**
   * Tidy: one element per line, no blank lines, no empty wrappers, no
   * stray spaces before closing tags. Structure carries the meaning here,
   * not vertical rhythm — and every saved character is a saved token.
   */
  function tidy(html) {
    return html
      .replace(/<(div|li|p|label|legend|td|th|tr|strong|em|b|i|u|sup|sub|code)>\s*<\/\1>/g, "")
      .replace(/[ \t]+(<\/[a-z]+>)/g, "$1")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{2,}/g, "\n")
      .trim();
  }

  /* ---------------------------------------------------------------- */
  /* Root selection                                                      */
  /* ---------------------------------------------------------------- */

  function selectionRoot() {
    const sel = window.getSelection?.();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    if (String(sel).trim().length < MIN_SELECTION_CHARS) return null;
    const range = sel.getRangeAt(0);
    let node = range.commonAncestorContainer;
    if (node.nodeType !== Node.ELEMENT_NODE) node = node.parentElement;
    return node || null;
  }

  /* ---------------------------------------------------------------- */
  /* Public API                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * @param {{ maxChars?: number, scope?: "viewport"|"page" }} [options]
   * @returns {{ html: string, meta: { title: string, url: string, scope: string, chars: number, truncated: boolean } }}
   */
  function extract(options = {}) {
    const maxChars = Math.max(1000, Number(options.maxChars) || DEFAULT_MAX_CHARS);
    const wanted = options.scope === "page" ? "page" : "viewport";

    let root = selectionRoot();
    let scope = root ? "selection" : wanted;
    if (!root) root = document.body || document.documentElement;

    const ctx = {
      filterViewport: scope === "viewport",
      vp: viewportRect(),
      parts: [],
      budget: { left: maxChars, truncated: false },
      inPre: false,
    };
    walk(root, ctx);

    let html = tidy(ctx.parts.join(""));

    // A viewport pass on a page whose quiz is fully scrolled away yields
    // nothing useful — fall back to the whole page rather than fail.
    if (scope === "viewport" && html.replace(/<[^>]+>/g, "").trim().length < 20) {
      const full = { ...ctx, filterViewport: false, parts: [], budget: { left: maxChars, truncated: false } };
      walk(root, full);
      html = tidy(full.parts.join(""));
      ctx.budget.truncated = full.budget.truncated;
      scope = "page";
    }

    return {
      html,
      meta: {
        title: collapse(document.title || "").trim().slice(0, 200),
        url: location.href.slice(0, 500),
        scope,
        chars: html.length,
        truncated: ctx.budget.truncated,
      },
    };
  }

  window.QuizKey.PageExtractor = Object.freeze({ extract });
})();
