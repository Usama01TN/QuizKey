import { motion } from "framer-motion";
import { AppWindow, ArrowRight, Boxes, FileCode2, MousePointerClick, MonitorCog } from "lucide-react";

const fade = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
};

const LANES = [
  {
    icon: MonitorCog,
    title: "Background worker",
    tag: "service_worker · ES module",
    modules: [
      ["service-worker.js", "commands → capture → AI → messaging"],
      ["lib/ai-client.js", "vision API + JSON validation"],
      ["lib/prompts.js", "system prompt construction"],
      ["lib/storage.js", "settings + per-tab results"],
      ["lib/errors.js", "codes → user messages"],
    ],
    accent: "text-viol",
    border: "hover:border-viol/40",
  },
  {
    icon: AppWindow,
    title: "Chromium APIs",
    tag: "manifest v3 surface",
    modules: [
      ["commands", "Alt+Q · Alt+A bindings"],
      ["tabs.captureVisibleTab", "the screenshot"],
      ["runtime.sendMessage", "typed message bus"],
      ["storage.onChanged", "live settings sync"],
      ["permissions.request", "optional custom endpoints"],
    ],
    accent: "text-fg/70",
    border: "hover:border-fg/25",
  },
  {
    icon: MousePointerClick,
    title: "Content scripts",
    tag: "isolated world · QuizKey namespace",
    modules: [
      ["content-script.js", "message router, owns no logic"],
      ["dom-detector.js", "question / option / input discovery"],
      ["typing-simulator.js", "per-char event stream + clicks"],
      ["overlay.js + .css", "status, results, progress, toasts"],
    ],
    accent: "text-acid",
    border: "hover:border-acid/40",
  },
];

const SEQUENCE = [
  "Alt+Q",
  "commands.onCommand",
  "captureVisibleTab",
  "analyzeScreenshot()",
  "validate JSON",
  "saveResult(tabId)",
  "QUIZKEY_ANALYSIS",
  "overlay + highlight",
  "Alt+A",
  "findInputField()",
  "typeText() × N chars",
];

const FILE_TABLE: [string, string][] = [
  ["manifest.json", "MV3 wiring: permissions, commands, script order, CSP defaults"],
  ["background/service-worker.js", "Single orchestrator; badge lifecycle; guarded failure paths"],
  ["lib/storage.js", "DEFAULT_SETTINGS, get/set, per-tab result store, pruning"],
  ["lib/ai-client.js", "Provider-agnostic fetch, timeout abort, response validation"],
  ["lib/prompts.js", "System prompt + message payload for the vision model"],
  ["lib/errors.js", "QuizKeyError, ErrorCodes, normalizeError, user messages"],
  ["content/content-script.js", "Routes messages, guards double-injection, owns tab state"],
  ["content/dom-detector.js", "Scores editable targets, fuzzy-matches choice options"],
  ["content/typing-simulator.js", "Native-setter typing, key event chain, pointer click replay"],
  ["content/overlay.js", "Shadow-free namespaced UI: cards, progress, toasts"],
  ["popup/*", "Status, shortcuts, one-click actions, latest analysis"],
  ["options/*", "Full settings, test connection, live cadence preview"],
];

export default function Architecture() {
  return (
    <section id="architecture" className="relative py-24 md:py-32">
      <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,black,transparent)] opacity-60" />
      <div className="relative mx-auto max-w-7xl px-5 md:px-8">
        <div className="mb-14 max-w-2xl">
          <p className="mb-3 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.25em] text-acid">
            <span className="h-px w-8 bg-acid/60" /> Architecture
          </p>
          <h2 className="text-4xl font-bold tracking-tight md:text-5xl">
            Strict module <span className="text-acid">separation.</span>
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-mist">
            Screenshot capture, AI analysis, DOM detection, keyboard simulation, settings
            and error handling each live in their own module with one job — glued together
            by typed messages, never by shared state.
          </p>
        </div>

        {/* lanes */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
          {LANES.map((lane, li) => (
            <div key={lane.title} className="flex flex-1 flex-col gap-4 lg:flex-row lg:items-center">
              <motion.div
                {...fade}
                transition={{ duration: 0.6, delay: li * 0.1 }}
                className={`flex-1 rounded-3xl border border-fg/[0.08] bg-panel p-6 transition-colors ${lane.border}`}
              >
                <div className="mb-5 flex items-center gap-3">
                  <span className={`grid h-10 w-10 place-items-center rounded-xl border border-fg/10 bg-fg/[0.04] ${lane.accent}`}>
                    <lane.icon size={18} />
                  </span>
                  <div>
                    <h3 className="text-[15px] font-bold leading-tight">{lane.title}</h3>
                    <p className="font-mono text-[10px] text-mist">{lane.tag}</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {lane.modules.map(([name, desc]) => (
                    <div key={name} className="rounded-xl bg-fg/[0.03] px-3.5 py-2.5">
                      <p className="font-mono text-[11px] font-semibold text-fg/90">{name}</p>
                      <p className="mt-0.5 text-[11px] text-mist">{desc}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
              {li < LANES.length - 1 && (
                <motion.div
                  {...fade}
                  transition={{ duration: 0.5, delay: 0.3 + li * 0.1 }}
                  className="flex items-center justify-center lg:flex-none"
                >
                  <ArrowRight size={20} className="rotate-90 text-acid/70 lg:rotate-0" />
                </motion.div>
              )}
            </div>
          ))}
        </div>

        {/* message sequence */}
        <motion.div
          {...fade}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="mt-6 overflow-hidden rounded-3xl border border-fg/[0.08] bg-panel"
        >
          <div className="flex items-center gap-2.5 border-b border-fg/[0.07] px-6 py-3.5">
            <Boxes size={14} className="text-acid" />
            <span className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-mist">
              One full cycle as messages
            </span>
          </div>
          <div className="code-scroll flex items-center gap-0 overflow-x-auto px-6 py-5">
            {SEQUENCE.map((step, i) => (
              <span key={step} className="flex shrink-0 items-center">
                <span
                  className={`rounded-lg border px-3 py-1.5 font-mono text-[11px] ${
                    step.startsWith("Alt")
                      ? "border-acid/40 bg-acid/10 font-bold text-acid"
                      : step.includes("()")
                        ? "border-viol/30 bg-viol/10 text-viol-soft"
                        : "border-fg/10 bg-fg/[0.03] text-fg/80"
                  }`}
                >
                  {step}
                </span>
                {i < SEQUENCE.length - 1 && <span className="px-1.5 font-mono text-[11px] text-acid/60">→</span>}
              </span>
            ))}
          </div>
        </motion.div>

        {/* file responsibilities */}
        <motion.div
          {...fade}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-6 rounded-3xl border border-fg/[0.08] bg-panel"
        >
          <div className="flex items-center gap-2.5 border-b border-fg/[0.07] px-6 py-3.5">
            <FileCode2 size={14} className="text-acid" />
            <span className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-mist">
              Every file, one responsibility
            </span>
          </div>
          <div className="grid md:grid-cols-2">
            {FILE_TABLE.map(([file, desc], i) => (
              <div
                key={file}
                className={`flex flex-col gap-1 px-6 py-4 sm:flex-row sm:items-baseline sm:gap-4 ${
                  i % 2 === 0 ? "md:border-r" : ""
                } border-b border-fg/[0.05]`}
              >
                <span className="shrink-0 font-mono text-[11.5px] font-semibold text-acid-soft sm:w-56">
                  {file}
                </span>
                <span className="text-[12.5px] text-mist">{desc}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
