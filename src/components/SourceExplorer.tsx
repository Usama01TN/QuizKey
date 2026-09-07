import { useCallback, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Braces,
  Check,
  Copy,
  Download,
  FileCode2,
  FileText,
  Folder,
  Palette,
} from "lucide-react";
import { CodeBlock } from "../lib/highlight";
import { PROJECT_TREE, SOURCE_FILES, type Lang } from "../lib/sources";

const LANG_ICON: Record<Lang, typeof FileCode2> = {
  js: FileCode2,
  json: Braces,
  html: FileCode2,
  css: Palette,
  md: FileText,
};

const LANG_COLOR: Record<Lang, string> = {
  js: "text-acid",
  json: "text-viol",
  html: "text-rose-300",
  css: "text-sky-300",
  md: "text-mist",
};

interface TreeGroup {
  folder: string | null;
  files: typeof SOURCE_FILES;
}

function buildGroups(): TreeGroup[] {
  const order = [null, "background", "lib", "content", "popup", "options"];
  const groups: TreeGroup[] = [];
  for (const folder of order) {
    const files = SOURCE_FILES.filter((f) =>
      folder === null ? !f.path.includes("/") : f.path.startsWith(`${folder}/`)
    );
    if (files.length) groups.push({ folder, files });
  }
  return groups;
}

export default function SourceExplorer() {
  const groups = useMemo(buildGroups, []);
  const [active, setActive] = useState("manifest.json");
  const [copied, setCopied] = useState(false);
  const codePaneRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);

  const file = SOURCE_FILES.find((f) => f.path === active) ?? SOURCE_FILES[0];
  const lines = file.code.split("\n").length;
  const sizeKb = (new Blob([file.code]).size / 1024).toFixed(1);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(file.code);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = file.code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }, [file]);

  const onTreeKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const idx = SOURCE_FILES.findIndex((f) => f.path === active);
    const next =
      e.key === "ArrowDown"
        ? Math.min(SOURCE_FILES.length - 1, idx + 1)
        : Math.max(0, idx - 1);
    setActive(SOURCE_FILES[next].path);
    codePaneRef.current?.scrollTo({ top: 0 });
  };

  return (
    <section id="source" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <div className="mb-14 flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="mb-3 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.25em] text-acid">
              <span className="h-px w-8 bg-acid/60" /> Complete source
            </p>
            <h2 className="text-4xl font-bold tracking-tight md:text-5xl">
              Read every line <span className="text-acid">right here.</span>
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-mist">
              The explorer below renders the actual files that ship inside the extension —
              no excerpts, no placeholders. Use{" "}
              <kbd className="rounded border border-white/15 bg-white/5 px-1.5 font-mono text-[11px] text-acid">↑</kbd>{" "}
              <kbd className="rounded border border-white/15 bg-white/5 px-1.5 font-mono text-[11px] text-acid">↓</kbd>{" "}
              in the tree to move between files.
            </p>
          </div>
          <a
            href="/quizkey-extension.zip"
            download
            className="flex h-11 items-center gap-2 rounded-xl bg-acid px-5 text-[13px] font-bold text-[#0c0e04] transition-all hover:brightness-110 hover:shadow-[0_0_32px_rgba(180,240,60,0.4)]"
          >
            <Download size={15} strokeWidth={2.5} />
            quizkey-extension.zip
          </a>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7 }}
          className="overflow-hidden rounded-3xl border border-white/[0.09] bg-[#0a0b11] shadow-[0_40px_120px_rgba(0,0,0,0.5)]"
        >
          {/* window bar */}
          <div className="flex items-center justify-between border-b border-white/[0.07] bg-[#101118] px-5 py-3">
            <span className="flex items-center gap-3">
              <span className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#3a3d4a]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#3a3d4a]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#3a3d4a]" />
              </span>
              <span className="font-mono text-[11px] text-mist">~/quizkey/extension</span>
            </span>
            <span className="hidden font-mono text-[10.5px] text-[#565b6c] sm:block">
              {SOURCE_FILES.length} files · Manifest V3
            </span>
          </div>

          <div className="flex flex-col md:h-[640px] md:flex-row">
            {/* ------------------------------ tree ------------------------------ */}
            <div
              ref={treeRef}
              tabIndex={0}
              onKeyDown={onTreeKey}
              className="code-scroll shrink-0 overflow-x-auto border-b border-white/[0.07] bg-[#0c0d13] p-3 outline-none focus-visible:ring-1 focus-visible:ring-acid/40 md:w-72 md:overflow-y-auto md:border-b-0 md:border-r"
            >
              <div className="flex gap-1 md:block md:space-y-3">
                {groups.map((group) => (
                  <div key={group.folder ?? "root"} className="shrink-0 md:shrink">
                    {group.folder && (
                      <p className="mb-1 hidden items-center gap-1.5 px-2 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[#565b6c] md:flex">
                        <Folder size={11} className="text-acid/60" />
                        {group.folder}/
                      </p>
                    )}
                    <div className="flex gap-1 md:block md:space-y-0.5">
                      {group.files.map((f) => {
                        const Icon = LANG_ICON[f.lang];
                        const isActive = f.path === active;
                        return (
                          <button
                            key={f.path}
                            onClick={() => {
                              setActive(f.path);
                              codePaneRef.current?.scrollTo({ top: 0 });
                            }}
                            className={`flex w-full items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-1.5 font-mono text-[11.5px] transition-colors ${group.folder ? "md:pl-6" : ""} ${
                              isActive
                                ? "bg-acid/10 text-acid"
                                : "text-[#8b90a0] hover:bg-white/[0.04] hover:text-white"
                            }`}
                          >
                            <Icon size={12.5} className={isActive ? "text-acid" : LANG_COLOR[f.lang]} />
                            {group.folder ? f.path.split("/").pop() : f.path}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <pre className="mt-4 hidden border-t border-white/[0.06] px-2 pt-4 font-mono text-[10px] leading-relaxed text-[#41454f] md:block">
                {PROJECT_TREE}
              </pre>
            </div>

            {/* ------------------------------ code ------------------------------ */}
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] bg-[#0c0d13] px-5 py-3">
                <span className="flex items-center gap-2.5 font-mono text-[11.5px]">
                  <span className="text-white/90">{file.path}</span>
                  <span className={`rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider ${LANG_COLOR[file.lang]}`}>
                    {file.lang}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-mono text-[10.5px] text-[#565b6c]">
                    {lines} lines · {sizeKb} KB
                  </span>
                  <button
                    onClick={copy}
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 font-mono text-[10.5px] text-mist transition-colors hover:border-acid/40 hover:text-acid"
                  >
                    {copied ? <Check size={12} className="text-acid" /> : <Copy size={12} />}
                    {copied ? "copied" : "copy"}
                  </button>
                </span>
              </div>
              <div ref={codePaneRef} className="code-scroll min-h-[420px] flex-1 overflow-auto py-3 md:min-h-0">
                <CodeBlock code={file.code} lang={file.lang} />
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
