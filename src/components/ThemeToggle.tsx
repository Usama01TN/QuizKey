import { Moon, Sun } from "lucide-react";
import { useTheme } from "../lib/theme";

/** Sun/Moon switch — the icon shows the theme you will switch *to*. */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const { isLight, toggle } = useTheme();
  const label = isLight ? "Switch to dark mode" : "Switch to light mode";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={`relative grid h-9 w-9 cursor-pointer place-items-center rounded-lg border border-line text-mist transition-colors hover:border-fg/25 hover:bg-fg/5 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acid/60 ${className}`}
    >
      <Sun
        size={15}
        className={`absolute transition-all duration-300 ${isLight ? "scale-0 -rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100"}`}
      />
      <Moon
        size={15}
        className={`absolute transition-all duration-300 ${isLight ? "scale-100 rotate-0 opacity-100" : "scale-0 rotate-90 opacity-0"}`}
      />
    </button>
  );
}
