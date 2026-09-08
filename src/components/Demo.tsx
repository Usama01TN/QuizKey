import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  BrainCircuit,
  Camera,
  CheckCircle2,
  Eye,
  Keyboard,
  Loader2,
  MousePointer2,
  Play,
  RotateCcw,
  Target,
  X,
} from "lucide-react";

type Phase =
  | "idle"
  | "capturing"
  | "analyzing"
  | "parsed"
  | "decided"
  | "acting"
  | "done"
  | "error";

const ANSWER = "Saturn";

const STEPS = [
  { icon: Camera, label: "Capture visible tab", sub: "tabs.captureVisibleTab" },
  { icon: BrainCircuit, label: "Vision AI analysis", sub: "POST /v1/chat/completions" },
  { icon: Eye, label: "Parse question & options", sub: "structured JSON, validated" },
  { icon: Target, label: "Decide best answer", sub: "confidence-scored" },
  { icon: Keyboard, label: "Simulate input", sub: "click + per-char keystrokes" },
];

const PHASE_STEP: Record<Phase, number> = {
  idle: -1,
  capturing: 0,
  analyzing: 1,
  parsed: 2,
  decided: 3,
  acting: 4,
  done: 5,
  error: 4,
};

const AI_LINES = [
  '{',
  '  "question": "Which planet has the most confirmed moons?",',
  '  "inputKind": "choice",',
  '  "correctAnswerId": "C",',
  '  "answerText": "Saturn",',
  '  "confidence": 0.97',
  '}',
];

export default function Demo() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [delay, setDelay] = useState(60);
  const [jitter, setJitter] = useState(45);
  const [autoType, setAutoType] = useState(true);
  const [hideInput, setHideInput] = useState(false);

  const [typed, setTyped] = useState("");
  const [clickedOption, setClickedOption] = useState(false);
  const [progress, setProgress] = useState(0);
  const [cursor, setCursor] = useState<{ x: number; y: number; visible: boolean; click: boolean }>({
    x: 0,
    y: 0,
    visible: false,
    click: false,
  });

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const settingsRef = useRef({ delay, jitter, autoType, hideInput });
  settingsRef.current = { delay, jitter, autoType, hideInput };

  const stageRef = useRef<HTMLDivElement>(null);
  const optionCRef = useRef<HTMLButtonElement>(null);

  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const after = useCallback((ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const busyRef = useRef(false);

  const reset = useCallback(() => {
    clearTimers();
    busyRef.current = false;
    setPhase("idle");
    setTyped("");
    setClickedOption(false);
    setProgress(0);
    setCursor((c) => ({ ...c, visible: false, click: false }));
  }, [clearTimers]);

  const startActing = useCallback(() => {
    if (busyRef.current && phaseRef.current !== "decided") return;
    const { delay: d, jitter: j, hideInput: hide } = settingsRef.current;
    setPhase("acting");

    // 1 — fly the cursor to option C and "click" it with pointer events
    const stage = stageRef.current?.getBoundingClientRect();
    const opt = optionCRef.current?.getBoundingClientRect();
    if (stage && opt) {
      setCursor({
        x: opt.left - stage.left + opt.width / 2,
        y: opt.top - stage.top + opt.height / 2,
        visible: true,
        click: false,
      });
    }
    after(650, () => {
      setCursor((c) => ({ ...c, click: true }));
      after(160, () => {
        setClickedOption(true);
        setCursor((c) => ({ ...c, visible: false, click: false }));
      });
    });

    // 2 — type the answer char by char (or fail gracefully when hidden)
    after(1350, () => {
      if (hide) {
        after(500, () => {
          setPhase("error");
          busyRef.current = false;
        });
        return;
      }
      let i = 0;
      const tick = () => {
        if (i >= ANSWER.length) {
          after(350, () => setPhase("done"));
          busyRef.current = false;
          return;
        }
        setTyped(ANSWER.slice(0, i + 1));
        setProgress(i + 1);
        let wait = d + Math.floor(Math.random() * (j + 1));
        if (ANSWER[i] === " ") wait *= 1.6;
        i += 1;
        after(Math.round(wait), tick);
      };
      tick();
    });
    }, [after]);

  const run = useCallback(() => {
    if (busyRef.current) return;
    busyRef.current = true;
    reset();
    busyRef.current = true;
    setPhase("capturing");
    after(1050, () => setPhase("analyzing"));
    after(2600, () => setPhase("parsed"));
    after(3450, () => {
      setPhase("decided");
      if (settingsRef.current.autoType) after(950, () => startActing());
    });
  }, [after, reset, startActing]);

  // physical shortcuts inside the demo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      if (e.key === "q" || e.key === "Q") {
        e.preventDefault();
        run();
      }
      if ((e.key === "a" || e.key === "A") && phase === "decided") {
        e.preventDefault();
        startActing();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run, startActing, phase]);

  const activeStep = PHASE_STEP[phase];
  const running = phase !== "idle" && phase !== "done" && phase !== "error";
  const highlightQ = phase === "parsed" || phase === "decided" || phase === "acting" || phase === "done";
  const highlightA = phase === "decided" || phase === "acting" || phase === "done";
  const showOverlay = phase === "decided" || phase === "acting" || phase === "done" || phase === "error";

  return (
    <section id="demo" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        {/* heading */}
        <div className="mb-14 max-w-2xl">
          <p className="mb-3 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.25em] text-acid">
            <span className="h-px w-8 bg-acid/60" /> Live pipeline
          </p>
          <h2 className="text-4xl font-bold tracking-tight md:text-5xl">
            Watch one keystroke do{" "}
            <span className="text-acid">the whole job.</span>
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-mist">
            A faithful in-page replay of the extension's flow on a mock quiz. Tune the
            cadence, toggle auto-type, or hide the input field to see how errors surface —
            then fire it with <kbd className="rounded border border-fg/15 bg-fg/5 px-1.5 font-mono text-[11px] text-acid">Alt</kbd>+<kbd className="rounded border border-fg/15 bg-fg/5 px-1.5 font-mono text-[11px] text-acid">Q</kbd>.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[370px,1fr]">
          {/* ------------------------- control deck ------------------------- */}
          <div className="flex flex-col gap-4">
            <div className="rounded-3xl border border-fg/[0.08] bg-panel p-6">
              <div className="mb-5 flex items-center justify-between">
                <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-mist">
                  Pipeline config
                </span>
                <span className="font-mono text-[10.5px] text-acid">
                  {delay}ms ± {jitter}ms
                </span>
              </div>

              <button
                onClick={run}
                disabled={running}
                className="group mb-6 flex h-12 w-full items-center justify-center gap-2.5 rounded-xl bg-acid text-[14px] font-bold text-on-acid transition-all enabled:hover:brightness-110 enabled:hover:shadow-[0_0_36px_rgba(180,240,60,0.4)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {running ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Play size={15} strokeWidth={2.5} />
                )}
                {running ? "Running…" : "Capture & analyze"}
                <kbd className="rounded-md border border-[var(--shade)] bg-[var(--shade)] px-1.5 py-0.5 font-mono text-[10px]">
                  ⌥Q
                </kbd>
              </button>

              <div className="space-y-5">
                <div>
                  <div className="mb-2 flex justify-between text-[12px]">
                    <span className="font-medium text-fg/80">Delay per character</span>
                    <span className="font-mono text-acid">{delay} ms</span>
                  </div>
                  <input
                    type="range"
                    min={15}
                    max={220}
                    step={5}
                    value={delay}
                    disabled={running}
                    onChange={(e) => setDelay(Number(e.target.value))}
                    className="acid-range w-full disabled:opacity-40"
                  />
                </div>
                <div>
                  <div className="mb-2 flex justify-between text-[12px]">
                    <span className="font-medium text-fg/80">Human jitter</span>
                    <span className="font-mono text-acid">± {jitter} ms</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={120}
                    step={5}
                    value={jitter}
                    disabled={running}
                    onChange={(e) => setJitter(Number(e.target.value))}
                    className="acid-range w-full disabled:opacity-40"
                  />
                </div>

                <label className="flex cursor-pointer items-center justify-between rounded-xl border border-fg/[0.07] bg-fg/[0.03] px-4 py-3">
                  <span className="text-[12.5px] font-medium text-fg/85">
                    Auto-type after analysis
                  </span>
                  <input
                    type="checkbox"
                    checked={autoType}
                    onChange={(e) => setAutoType(e.target.checked)}
                    className="h-4 w-4 accent-acid"
                  />
                </label>

                <label className="flex cursor-pointer items-center justify-between rounded-xl border border-fg/[0.07] bg-fg/[0.03] px-4 py-3">
                  <span className="text-[12.5px] font-medium text-fg/85">
                    Hide input field{" "}
                    <span className="text-mist">(error path)</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={hideInput}
                    disabled={running}
                    onChange={(e) => setHideInput(e.target.checked)}
                    className="h-4 w-4 accent-acid"
                  />
                </label>
              </div>
            </div>

            {/* stepper */}
            <div className="rounded-3xl border border-fg/[0.08] bg-panel p-5">
              {STEPS.map((step, i) => {
                const done = activeStep > i || phase === "done";
                const active = activeStep === i && running;
                const failed = phase === "error" && i === STEPS.length - 1;
                return (
                  <div key={step.label} className="flex gap-3.5">
                    <div className="flex flex-col items-center">
                      <div
                        className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border transition-all duration-300 ${
                          failed
                            ? "border-red-400/50 bg-red-400/10 text-red-400"
                            : done
                              ? "border-acid/50 bg-acid/10 text-acid"
                              : active
                                ? "border-acid/40 bg-acid/[0.06] text-acid shadow-[0_0_18px_rgba(180,240,60,0.2)]"
                                : "border-fg/[0.08] bg-fg/[0.02] text-mist"
                        }`}
                      >
                        {done && !failed ? (
                          <CheckCircle2 size={15} />
                        ) : failed ? (
                          <AlertTriangle size={15} />
                        ) : active ? (
                          <Loader2 size={15} className="animate-spin" />
                        ) : (
                          <step.icon size={15} />
                        )}
                      </div>
                      {i < STEPS.length - 1 && (
                        <div
                          className={`my-1 w-px flex-1 transition-colors duration-300 ${
                            activeStep > i ? "bg-acid/40" : "bg-fg/[0.07]"
                          }`}
                        />
                      )}
                    </div>
                    <div className="pb-5 pt-1.5">
                      <p
                        className={`text-[13px] font-semibold leading-tight transition-colors ${
                          done || active ? "text-fg" : "text-mist"
                        }`}
                      >
                        {step.label}
                      </p>
                      <p className="mt-0.5 font-mono text-[10.5px] text-mist2">{step.sub}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* --------------------------- mock browser --------------------------- */}
          <div className="overflow-hidden rounded-3xl border border-fg/[0.08] bg-panel shadow-[0_40px_120px_var(--shade-lg)]">
            {/* chrome */}
            <div className="flex items-center gap-3 border-b border-fg/[0.07] bg-panel2 px-5 py-3">
              <span className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-line2" />
                <span className="h-2.5 w-2.5 rounded-full bg-line2" />
                <span className="h-2.5 w-2.5 rounded-full bg-line2" />
              </span>
              <span className="mx-auto flex w-full max-w-md items-center gap-2 rounded-lg bg-panel px-3.5 py-1.5 font-mono text-[11px] text-mist">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                learn.university.edu/quiz/astronomy-101
              </span>
              <span className="grid h-6 w-6 place-items-center rounded-md border border-acid/30 bg-acid/10 font-mono text-[8px] font-bold text-acid">
                QK
              </span>
            </div>

            {/* page */}
            <div ref={stageRef} className="relative min-h-[520px] p-6 md:p-9">
              {phase === "capturing" && <div className="qk-flash" />}
              {phase === "capturing" && <div className="qk-scanline" />}

              {/* fake cursor */}
              <AnimatePresence>
                {cursor.visible && (
                  <motion.div
                    initial={{ opacity: 0, x: cursor.x - 160, y: cursor.y - 130 }}
                    animate={{ opacity: 1, x: cursor.x, y: cursor.y, scale: cursor.click ? 0.8 : 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                    className="pointer-events-none absolute left-0 top-0 z-40 -translate-x-1 -translate-y-1"
                  >
                    <MousePointer2 size={20} className="fill-acid text-on-acid drop-shadow-[0_0_12px_rgba(180,240,60,0.7)]" />
                    {cursor.click && (
                      <span className="absolute -left-2 -top-2 h-9 w-9 animate-ping rounded-full border-2 border-acid/70" />
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* quiz content */}
              <div className={`mx-auto max-w-xl ${phase === "error" ? "qk-shake" : ""}`}>
                <p className="mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.2em] text-mist">
                  Astronomy 101 · Question 7 of 12
                </p>

                <div
                  className={`rounded-2xl border p-6 transition-all duration-500 ${
                    highlightQ
                      ? "border-viol/60 shadow-[0_0_0_3px_rgba(139,140,248,0.15)]"
                      : "border-fg/[0.08]"
                  } bg-panel`}
                >
                  <h3 className="text-[19px] font-semibold leading-snug">
                    Which planet in our solar system currently has the most confirmed moons?
                  </h3>

                  <div className="mt-5 grid gap-2.5">
                    {[
                      ["A", "Mercury"],
                      ["B", "Venus"],
                      ["C", "Saturn"],
                      ["D", "Mars"],
                    ].map(([id, name]) => {
                      const chosen = id === "C" && clickedOption;
                      const hinted = id === "C" && highlightA;
                      return (
                        <button
                          key={id}
                          ref={id === "C" ? optionCRef : undefined}
                          tabIndex={-1}
                          className={`flex items-center gap-3.5 rounded-xl border px-4 py-3 text-left text-[14px] transition-all duration-500 ${
                            chosen
                              ? "border-acid bg-acid/10 text-fg shadow-[0_0_24px_rgba(180,240,60,0.18)]"
                              : hinted
                                ? "border-acid/50 bg-acid/[0.05] text-fg"
                                : "border-fg/[0.09] bg-fg/[0.02] text-fg/75"
                          }`}
                        >
                          <span
                            className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border font-mono text-[11px] font-bold transition-colors duration-500 ${
                              chosen || hinted
                                ? "border-acid/60 bg-acid/15 text-acid"
                                : "border-fg/15 text-mist"
                            }`}
                          >
                            {id}
                          </span>
                          {name}
                          {chosen && (
                            <motion.span
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="ml-auto"
                            >
                              <CheckCircle2 size={17} className="text-acid" />
                            </motion.span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* free-text field (hidable for the error path) */}
                  <AnimatePresence initial={false}>
                    {!hideInput && (
                      <motion.div
                        initial={{ opacity: 0, height: 0, marginTop: 0 }}
                        animate={{ opacity: 1, height: "auto", marginTop: 20 }}
                        exit={{ opacity: 0, height: 0, marginTop: 0 }}
                        className="overflow-hidden"
                      >
                        <label className="mb-2 block text-[11.5px] font-semibold uppercase tracking-wider text-mist">
                          Your answer
                        </label>
                        <div
                          className={`flex items-center rounded-xl border bg-panel px-4 py-3 font-mono text-[14px] transition-all duration-300 ${
                            phase === "acting" || phase === "done"
                              ? "border-acid/50 shadow-[0_0_0_3px_rgba(180,240,60,0.1)]"
                              : "border-fg/15"
                          }`}
                        >
                          {typed ? (
                            <span className="text-fg">{typed}</span>
                          ) : (
                            <span className="text-mist2">Type here…</span>
                          )}
                          {(phase === "acting" || phase === "done") && !clickedOptionErrorGuard(phase, typed) && (
                            <span className="caret-blink ml-0.5 inline-block h-4 w-[7px] bg-acid" />
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* AI JSON stream */}
              <AnimatePresence>
                {phase === "analyzing" && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="absolute bottom-6 left-6 z-20 hidden w-[330px] rounded-2xl border border-fg/[0.09] bg-panel2/95 p-4 font-mono text-[10.5px] leading-relaxed text-mist shadow-2xl md:block"
                  >
                    <p className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-viol">
                      <BrainCircuit size={12} /> model response · streamed
                    </p>
                    {AI_LINES.map((line, i) => (
                      <motion.p
                        key={line}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.12 * i }}
                        className={line.includes('"C"') || line.includes("Saturn") || line.includes("0.97") ? "text-acid" : ""}
                      >
                        {line}
                      </motion.p>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* extension overlay replica */}
              <AnimatePresence>
                {showOverlay && phase !== "error" && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ type: "spring", stiffness: 350, damping: 28 }}
                    className="absolute right-4 top-4 z-30 w-[290px] rounded-2xl border border-fg/[0.11] bg-panel2/95 p-4 shadow-[0_24px_60px_var(--shade-lg)] backdrop-blur-xl"
                  >
                    <p className="mb-2 font-mono text-[9.5px] font-bold uppercase tracking-[0.2em] text-acid">
                      QuizKey · Question detected
                    </p>
                    <p className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-fg/90">
                      Which planet in our solar system currently has the most confirmed moons?
                    </p>
                    <div className="mt-3 rounded-xl border border-acid/30 bg-acid/[0.08] px-3 py-2.5">
                      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-mist">
                        Best answer
                      </p>
                      <p className="text-[13.5px] font-bold text-acid-soft">C — Saturn</p>
                    </div>
                    <div className="mt-3 flex items-center gap-2.5">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-fg/10">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: phase === "acting" || phase === "done" ? `${Math.round((progress / ANSWER.length) * 100)}%` : "97%" }}
                          className="h-full rounded-full bg-gradient-to-r from-acid to-emerald-400"
                        />
                      </div>
                      <span className="font-mono text-[10px] text-mist">
                        {phase === "acting"
                          ? `${progress}/${ANSWER.length} chars`
                          : phase === "done"
                            ? "typed ✓"
                            : "97%"}
                      </span>
                    </div>
                    {phase === "decided" && !settingsRef.current.autoType && (
                      <button
                        onClick={startActing}
                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-acid py-2 text-[12px] font-bold text-on-acid transition hover:brightness-110"
                      >
                        <Keyboard size={13} />
                        Type answer
                        <kbd className="rounded border border-[var(--shade)] bg-[var(--shade)] px-1 font-mono text-[9.5px]">⌥A</kbd>
                      </button>
                    )}
                    {phase === "done" && (
                      <p className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400">
                        <CheckCircle2 size={13} /> Typed with real key events — {delay}ms ± {jitter}ms
                      </p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* error toast */}
              <AnimatePresence>
                {phase === "error" && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, x: 10 }}
                    animate={{ opacity: 1, y: 0, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: "spring", stiffness: 380, damping: 26 }}
                    className="absolute right-4 top-4 z-30 flex w-[320px] gap-3 rounded-2xl border border-fg/[0.11] bg-panel2/95 p-4 shadow-2xl backdrop-blur-xl"
                  >
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-red-400/15 text-red-400">
                      <X size={14} strokeWidth={3} />
                    </span>
                    <div>
                      <p className="text-[12.5px] font-bold text-fg">NO_INPUT — handled gracefully</p>
                      <p className="mt-1 text-[11.5px] leading-relaxed text-mist">
                        No visible, editable field on this page. Focus the field and press{" "}
                        <kbd className="rounded border border-fg/15 bg-fg/5 px-1 font-mono text-[9.5px] text-acid">⌥A</kbd>{" "}
                        again — the answer stays pinned in the overlay.
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* under-controls */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-fg/[0.07] bg-panel px-5 py-4">
          <p className="font-mono text-[11px] text-mist">
            {phase === "idle" && "status: idle — press run or Alt+Q"}
            {phase === "capturing" && "status: capturing frame…"}
            {phase === "analyzing" && "status: waiting for model…"}
            {phase === "parsed" && "status: question parsed — locating answers…"}
            {phase === "decided" && "status: answer ready — Alt+A or auto-type"}
            {phase === "acting" && "status: simulating input events…"}
            {phase === "done" && "status: done — answer landed via keydown/keypress/input/keyup"}
            {phase === "error" && "status: QuizKeyError(NO_INPUT) — toast shown, nothing crashed"}
          </p>
          <button
            onClick={reset}
            className="flex items-center gap-2 rounded-lg border border-fg/10 px-4 py-2 text-[12px] font-semibold text-mist transition-colors hover:border-fg/25 hover:text-fg"
          >
            <RotateCcw size={13} />
            Reset demo
          </button>
        </div>
      </div>
    </section>
  );
}

// typing caret visibility helper — keeps the caret while the field is targeted
function clickedOptionErrorGuard(phase: string, typed: string) {
  return phase === "done" && typed.length > 0;
}
