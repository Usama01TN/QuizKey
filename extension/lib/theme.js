/**
 * lib/theme.js: dark / light / auto theme for the extension's own pages.
 *
 * The chosen mode lives in settings.theme ("auto" | "dark" | "light") so the
 * options page, the popup and the in-page overlay all agree. localStorage
 * keeps a synchronous mirror that lib/theme-boot.js reads before first paint.
 */
import { getSettings, setSettings, onSettingsChanged } from "./storage.js";

export const THEME_MODES = ["auto", "dark", "light"];
const MIRROR_KEY = "quizkey.theme";
const mq = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;

/** Resolve "auto" against the OS preference. */
export function resolveTheme(mode) {
  if (mode === "dark" || mode === "light") return mode;
  return mq && mq.matches ? "light" : "dark";
}

export function applyTheme(mode) {
  const resolved = resolveTheme(mode);
  const root = document.documentElement;
  root.setAttribute("data-theme", resolved);
  root.setAttribute("data-theme-mode", THEME_MODES.includes(mode) ? mode : "auto");
  root.style.colorScheme = resolved;
  try {
    localStorage.setItem(MIRROR_KEY, mode);
  } catch (_) {
    /* ignore */
  }
  return resolved;
}

/** Persist + apply. */
export async function setThemeMode(mode) {
  const safe = THEME_MODES.includes(mode) ? mode : "auto";
  applyTheme(safe);
  await setSettings({ theme: safe });
  return safe;
}

/**
 * Wire a page: apply the stored mode, follow OS changes while in "auto",
 * stay in sync with the other extension page, and (optionally) hook a
 * toggle button that flips dark ⇄ light.
 * @param {{ toggle?: HTMLElement|null, onChange?: (mode:string, resolved:string)=>void }} [opts]
 */
export async function initTheme({ toggle = null, onChange } = {}) {
  let mode = "auto";
  const paint = () => {
    const resolved = applyTheme(mode);
    if (toggle) {
      const goingTo = resolved === "light" ? "dark" : "light";
      toggle.setAttribute("aria-label", `Switch to ${goingTo} mode`);
      toggle.title = `Switch to ${goingTo} mode${mode === "auto" ? " (currently following your system)" : ""}`;
      toggle.dataset.resolved = resolved;
    }
    onChange?.(mode, resolved);
  };

  try {
    mode = (await getSettings()).theme || "auto";
  } catch (_) {
    /* storage unavailable, keep boot value */
  }
  paint();

  mq?.addEventListener("change", () => {
    if (mode === "auto") paint();
  });

  onSettingsChanged((settings) => {
    const next = settings?.theme || "auto";
    if (next !== mode) {
      mode = next;
      paint();
    }
  });

  toggle?.addEventListener("click", async () => {
    mode = resolveTheme(mode) === "light" ? "dark" : "light";
    paint();
    await setSettings({ theme: mode });
  });

  return {
    get mode() {
      return mode;
    },
    set: async (next) => {
      mode = await setThemeMode(next);
      paint();
    },
  };
}
