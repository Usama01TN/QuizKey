import { useEffect, useState } from "react";
import { BookOpen, Download } from "lucide-react";

const LINKS = [
  { href: "#demo", label: "Demo" },
  { href: "#features", label: "Features" },
  { href: "#architecture", label: "Architecture" },
  { href: "#source", label: "Source" },
  { href: "#install", label: "Install" },
];

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-white/[0.07] bg-[#07070c]/85 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 md:px-8">
        <a href="#top" className="group flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] border border-white/10 border-b-[3px] bg-gradient-to-b from-[#23252f] to-[#14151c] font-mono text-[11px] font-bold tracking-wider text-acid transition-shadow group-hover:shadow-[0_0_24px_rgba(180,240,60,0.35)]">
            QK
          </span>
          <span className="flex items-baseline gap-2">
            <span className="text-[15px] font-bold tracking-tight">QuizKey</span>
            <span className="hidden font-mono text-[10px] text-mist sm:inline">v1.0.0 · MV3</span>
          </span>
        </a>

        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-lg px-3.5 py-2 text-[13px] font-medium text-mist transition-colors hover:bg-white/5 hover:text-white"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2.5">
          <a
            href="https://developer.chrome.com/docs/extensions/develop"
            target="_blank"
            rel="noreferrer"
            className="hidden h-9 items-center gap-2 rounded-lg border border-white/10 px-3.5 text-[12.5px] font-medium text-mist transition-colors hover:border-white/25 hover:text-white sm:flex"
          >
            <BookOpen size={14} />
            Docs
          </a>
          <a
            href="/quizkey-extension.zip"
            download
            className="flex h-9 items-center gap-2 rounded-lg bg-acid px-4 text-[12.5px] font-bold text-[#0c0e04] transition-all hover:brightness-110 hover:shadow-[0_0_28px_rgba(180,240,60,0.4)]"
          >
            <Download size={14} strokeWidth={2.5} />
            Download .zip
          </a>
        </div>
      </div>
    </header>
  );
}
