/**
 * popup/popup.js (ES module)
 * Quick-action panel: page-access diagnosis, live status, configured
 * shortcuts, latest analysis, and one-click triggers that mirror the
 * keyboard shortcuts.
 */
import { classifyPageAccess, hasFileUrlsPermission } from "../lib/page-access.js";
import { initTheme } from "../lib/theme.js";

(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);

  const els = {
    statusPill: $("#status-pill"),
    shortcutList: $("#shortcut-list"),
    btnCapture: $("#btn-capture"),
    btnType: $("#btn-type"),
    notice: $("#notice"),
    result: $("#result"),
    resultQuestion: $("#result-question"),
    resultAnswer: $("#result-answer"),
    resultConf: $("#result-conf"),
    resultConfNum: $("#result-conf-num"),
    btnOptions: $("#btn-options"),
    modelLabel: $("#model-label"),
  };

  let activeTabId = null;

  /* ---------------------------------------------------------------- */

  function setStatus(tone, label) {
    els.statusPill.className = `pill pill-${tone}`;
    els.statusPill.textContent = label;
  }

  /** @param {"error"|"info"} tone */
  function showNotice(text, tone = "error") {
    els.notice.hidden = !text;
    els.notice.textContent = text || "";
    els.notice.dataset.tone = tone;
  }

  function describeError(payload) {
    if (payload?.error?.userMessage) return payload.error.userMessage;
    return "Something went wrong. Check the settings page.";
  }

  function renderAnalysis(analysis) {
    if (!analysis) {
      els.result.hidden = true;
      return;
    }
    const best =
      analysis.inputKind === "choice"
        ? `${analysis.correctAnswerId ?? ""}. ${
            analysis.answers?.find?.((a) => a.id === analysis.correctAnswerId)?.text ||
            analysis.answerText ||
            ""
          }`.trim()
        : analysis.answerText;

    els.result.hidden = false;
    els.resultQuestion.textContent = analysis.question || "—";
    els.resultAnswer.textContent = best || "—";
    const pct = Math.round((analysis.confidence || 0) * 100);
    els.resultConf.style.width = `${pct}%`;
    els.resultConfNum.textContent = `${pct}% confident`;
  }

  async function renderShortcuts() {
    try {
      const commands = await chrome.commands.getAll();
      els.shortcutList.innerHTML = "";
      const labels = {
        "capture-and-answer": "Capture & analyze",
        "type-answer": "Type answer",
      };
      for (const cmd of commands.filter((c) => labels[c.name])) {
        const row = document.createElement("div");
        row.className = "shortcut-row";

        const name = document.createElement("span");
        name.textContent = labels[cmd.name];

        const key = document.createElement("kbd");
        key.textContent = cmd.shortcut || "Not set";
        if (cmd.name === "capture-and-answer") $("#capture-hint").textContent = cmd.shortcut || "Not set";
        if (cmd.name === "type-answer") $("#type-hint").textContent = cmd.shortcut || "Not set";

        row.append(name, key);
        els.shortcutList.appendChild(row);
      }
    } catch (_) {
      /* commands API unavailable — leave the section empty */
    }
  }

  async function loadState() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTabId = tab?.id ?? null;
    if (!activeTabId) {
      setStatus("warn", "No active tab");
      return;
    }

    const filePermission = await hasFileUrlsPermission();
    const access = classifyPageAccess(tab?.url, { filePermission });

    const state = await chrome.runtime
      .sendMessage({ type: "QUIZKEY_POPUP_STATE", tabId: activeTabId })
      .catch(() => null);

    if (!state) {
      setStatus("warn", "Unavailable");
      showNotice("QuizKey cannot reach the background worker. Reload the extension once.");
      return;
    }

    els.modelLabel.textContent = `${state.settings.model || "auto model"} · ${state.apiStyle || "openai"}`;
    renderAnalysis(state.analysis);

    /* 1 — fully restricted pages: name the exact restriction + remedy */
    if (!access.ok) {
      setStatus("warn", access.short);
      showNotice(
        access.remedy ? `${access.reason}\n\nHow to fix: ${access.remedy}` : access.reason,
        "error"
      );
      els.btnCapture.disabled = true;
      els.btnType.disabled = true;
      return;
    }

    /* 2 — allowed to use: credentials / file-grant / injection notices */
    const needsKey = !state.hasApiKey;
    let notice = "";
    if (needsKey) {
      notice = "Add your AI API key in settings to enable capture (local servers like Ollama / LM Studio don't need one).";
    }
    // file:// pages capture fine without the grant — typing/overlay need it
    if (access.kind === "file" && !access.fileAccess) {
      notice =
        "Capture works on this file. To type answers and show the overlay here, enable file access in QuizKey Settings (“Allow access to local files”) — or Chrome’s toggle under QuizKey → Details — then reload this file.";
    } else if (!needsKey && !state.pageReachable) {
      notice =
        "QuizKey isn't attached to this tab yet (it was loaded before install). It will inject itself automatically on capture — if that fails, reload this tab once.";
    }
    showNotice(notice, "info");
    setStatus(needsKey ? "warn" : "ok", needsKey ? "API key needed" : "Ready");

    els.btnCapture.disabled = !state.hasApiKey;
    els.btnType.disabled = !state.analysis;
  }

  async function runAction(action) {
    const button = action === "capture" ? els.btnCapture : els.btnType;
    button.disabled = true;
    showNotice("");
    if (action === "capture") setStatus("idle", "Working…");
    try {
      const response = await chrome.runtime.sendMessage({
        type: "QUIZKEY_POPUP_ACTION",
        action,
        tabId: activeTabId,
      });
      if (response?.error) {
        showNotice(describeError(response));
        setStatus("warn", "Failed");
        return;
      }
      if (response?.question || response?.answerText) {
        renderAnalysis(response);
        els.btnType.disabled = false;
      }
      setStatus("ok", "Ready");
    } catch (err) {
      showNotice(String(err?.message || err));
      setStatus("warn", "Failed");
    } finally {
      button.disabled = false;
    }
  }

  els.btnCapture.addEventListener("click", () => void runAction("capture"));
  els.btnType.addEventListener("click", () => void runAction("type"));
  els.btnOptions.addEventListener("click", () => chrome.runtime.openOptionsPage());

  void initTheme({ toggle: $("#btn-theme") });
  void loadState();
  void renderShortcuts();
})();
