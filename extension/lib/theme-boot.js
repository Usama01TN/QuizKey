/**
 * lib/theme-boot.js — classic (non-module) script loaded first in <head> of
 * the options and popup pages. MV3 forbids inline scripts, so this file does
 * the "apply theme before first paint" job: it reads the last known choice
 * from localStorage (a synchronous mirror of the chrome.storage setting) or
 * the OS preference, and sets <html data-theme="dark|light"> immediately.
 */
(function () {
  try {
    var stored = localStorage.getItem("quizkey.theme"); // "dark" | "light" | "auto" | null
    var mode = stored === "dark" || stored === "light" ? stored : "auto";
    var light = mode === "light" || (mode === "auto" && window.matchMedia("(prefers-color-scheme: light)").matches);
    document.documentElement.setAttribute("data-theme", light ? "light" : "dark");
    document.documentElement.setAttribute("data-theme-mode", mode);
    document.documentElement.style.colorScheme = light ? "light" : "dark";
  } catch (_) {
    document.documentElement.setAttribute("data-theme", "dark");
  }
})();
