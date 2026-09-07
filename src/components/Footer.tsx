import { ArrowUp } from "lucide-react";

export default function Footer() {
  return (
    <footer className="relative border-t border-white/[0.07]">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-8 px-5 py-14 md:flex-row md:justify-between md:px-8">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 border-b-[3px] bg-gradient-to-b from-[#23252f] to-[#14151c] font-mono text-[11px] font-bold tracking-wider text-acid">
            QK
          </span>
          <div>
            <p className="text-[14px] font-bold">QuizKey</p>
            <p className="font-mono text-[10.5px] text-mist">
              AI quiz assistant · Manifest V3 · Chromium 102+
            </p>
          </div>
        </div>

        <p className="max-w-md text-center font-mono text-[10.5px] leading-relaxed text-[#565b6c] md:text-left">
          Open-source reference project. Screenshot → vision model → real keystrokes.
          No paste events were harmed (or used) in the making of this extension.
        </p>

        <a
          href="#top"
          className="flex h-10 items-center gap-2 rounded-xl border border-white/10 px-4 text-[12px] font-semibold text-mist transition-colors hover:border-acid/40 hover:text-acid"
        >
          <ArrowUp size={14} />
          Back to top
        </a>
      </div>
    </footer>
  );
}
