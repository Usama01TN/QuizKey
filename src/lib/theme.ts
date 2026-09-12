/**
 * lib/theme.ts
 * Dark / light theme state. The choice is persisted in localStorage and
 * mirrored onto <html class="light"> so every CSS token (see index.css)
 * flips at once. Falls back to the OS preference and keeps following it
 * until the user picks a theme explicitly.
 */
import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light";
export const THEME_KEY = "quizkey-theme";

function systemTheme(): Theme {
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function storedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("light", theme === "light");
  root.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#f4f5f9" : "#07070c");
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => storedTheme() ?? systemTheme());
  const [explicit, setExplicit] = useState<boolean>(() => storedTheme() !== null);

  // Keep <html> in sync.
  useEffect(() => applyTheme(theme), [theme]);

  // Follow the OS until the user chooses.
  useEffect(() => {
    if (explicit || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = (e: MediaQueryListEvent) => setTheme(e.matches ? "light" : "dark");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [explicit]);

  const set = useCallback((next: Theme) => {
    setTheme(next);
    setExplicit(true);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* private mode, session only */
    }
  }, []);

  const toggle = useCallback(() => set(theme === "light" ? "dark" : "light"), [set, theme]);

  return { theme, setTheme: set, toggle, isLight: theme === "light" };
}
