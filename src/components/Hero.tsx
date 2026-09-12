import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowDown, ChevronRight, Zap } from "lucide-react";

const MARQUEE = [
  "typing-simulator.js",
  "dom-detector.js",
  "ai-client.js",
  "service-worker.js",
  "overlay.js",
  "storage.js",
  "errors.js",
  "prompts.js",
  "manifest.json",
  "keydown → keypress → input → keyup",
];

interface LogLine {
  text: string;
  tone: "cmd" | "info" | "ok" | "lime";
}

const SEQUENCE: { delay: number; line: LogLine }[] = [
  { delay: 150, line: { text: "$ captureVisibleTab(windowId, jpeg:85)", tone: "cmd" } },
  { delay: 650, line: { text: "  → frame captured · 1920×1080 · 218 KB", tone: "info" } },
  { delay: 750, line: { text: "$ POST /v1/chat/completions · gpt-4o-mini", tone: "cmd" } },
  { delay: 1250, line: { text: "  ← 200 OK · question + 4 options parsed", tone: "info" } },
  { delay: 850, line: { text: '  ✓ best answer "C. Saturn" · 97% confident', tone: "ok" } },
  { delay: 900, line: { text: '  ⌨ ready: press Alt+A to type "Saturn"', tone: "lime" } },
];

export default function Hero() {
  const [altDown, setAltDown] = useState(false);
  const [qDown, setQDown] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [flashing, setFlashing] = useState(false);
  const [running, setRunning] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  useEffect(() => clearTimers, []);

  const runSequence = useCallback(() => {
    if (running) return;
    setRunning(true);
    setLog([]);
    clearTimers();

    setFlashing(true);
    timers.current.push(setTimeout(() => setFlashing(false), 900));

    let t = 0;
    SEQUENCE.forEach(({ delay, line }) => {
      t += delay;
      timers.current.push(
        setTimeout(() => setLog((prev) => [...prev, line]), t)
      );
    });
    timers.current.push(setTimeout(() => setRunning(false), t + 2400));
    timers.current.push(setTimeout(() => setLog([]), t + 7000));
  }, [running]);

  useEffect(() => {
    const isFormTarget = (e: KeyboardEvent) =>
      e.target instanceof HTMLElement &&
      ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Alt") {
        setAltDown(true);
        return;
      }
      if ((e.key === "q" || e.key === "Q") && !isFormTarget(e) && !e.repeat) {
        setQDown(true);
        runSequence();
        setTimeout(() => setQDown(false), 160);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Alt") setAltDown(false);
      if (e.key === "q" || e.key === "Q") setQDown(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [runSequence]);

  const toneClass: Record<LogLine["tone"], string> = {
    cmd: "text-fg",
    info: "text-mist",
    ok: "text-emerald-400",
    lime: "text-acid",
  };

  return (
    <section id="top" className="relative overflow-hidden pt-16">
      {/* backdrop */}
      <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_75%_65%_at_50%_0%,black,transparent)]" />
      <div className="absolute -top-40 right-[-10%] h-[560px] w-[560px] rounded-full bg-acid/[0.09] blur-[130px]" />
      <div className="absolute left-[-15%] top-1/3 h-[420px] w-[420px] rounded-full bg-viol/[0.07] blur-[130px]" />

      <div className="relative mx-auto max-w-7xl px-5 pb-16 pt-16 md:px-8 lg:pt-24">
        <div className="grid items-center gap-14 lg:grid-cols-2">
          {/* ------------------------------ copy ------------------------------ */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="mb-7 inline-flex items-center gap-2.5 rounded-full border border-fg/10 bg-fg/[0.04] py-1.5 pl-2 pr-4"
            >
              <span className="rounded-full bg-acid px-2 py-0.5 font-mono text-[10px] font-bold text-on-acid">
                MV3
              </span>
              <span className="text-[12px] font-medium text-mist">
                Open-source Chromium extension · complete source included
              </span>
            </motion.div>

            <h1 className="text-[13.5vw] font-bold leading-[0.95] tracking-[-0.03em] sm:text-7xl xl:text-[86px]">
              <motion.span
                className="block"
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.08 }}
              >
                Screenshot.
              </motion.span>
              <motion.span
                className="block text-acid [text-shadow:0_0_50px_rgba(180,240,60,0.35)]"
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.2 }}
              >
                Solved.
              </motion.span>
              <motion.span
                className="text-stroke block"
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.32 }}
              >
                Typed.
              </motion.span>
            </h1>

            <motion.p
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.42 }}
              className="mt-7 max-w-lg text-[15.5px] leading-relaxed text-mist"
            >
              QuizKey is a keyboard-first quiz assistant. One configurable shortcut
              captures the page, a vision model reads the question, and a second
              keystroke replays the answer as{" "}
              <span className="text-fg">genuine, per-character keyboard events</span>{" "}
              with a human cadence. Never pasted. Fully configurable. Graceful when it fails.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.52 }}
              className="mt-9 flex flex-wrap items-center gap-3.5"
            >
              <a
                href="#demo"
                className="group flex h-12 items-center gap-2 rounded-xl bg-acid px-6 text-[14px] font-bold text-on-acid transition-all hover:brightness-110 hover:shadow-[0_0_40px_rgba(180,240,60,0.45)]"
              >
                <Zap size={16} strokeWidth={2.5} />
                Run the live pipeline
                <ChevronRight size={15} className="transition-transform group-hover:translate-x-0.5" />
              </a>
              <a
                href="#source"
                className="flex h-12 items-center gap-2 rounded-xl border border-fg/12 px-6 text-[14px] font-semibold text-fg/85 transition-colors hover:border-fg/30 hover:bg-fg/5"
              >
                Browse the source
              </a>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.7 }}
              className="mt-11 flex flex-wrap gap-x-8 gap-y-3"
            >
              {[
                ["18", "source files"],
                ["6", "isolated modules"],
                ["2", "configurable commands"],
                ["0", "paste events"],
              ].map(([n, label]) => (
                <div key={label} className="flex items-baseline gap-2">
                  <span className="font-mono text-xl font-bold text-acid">{n}</span>
                  <span className="text-[12.5px] text-mist">{label}</span>
                </div>
              ))}
            </motion.div>
          </div>

          {/* --------------------------- keyboard --------------------------- */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.35 }}
            className="relative"
          >
            <div className="absolute -inset-8 rounded-[40px] bg-[radial-gradient(ellipse_at_center,rgba(180,240,60,0.10),transparent_65%)]" />

            <div className="relative rounded-[28px] border border-fg/10 bg-panel/80 p-6 shadow-[0_40px_120px_var(--shade-lg)] backdrop-blur md:p-9">
              {flashing && <div className="qk-flash rounded-[28px]" />}
              {flashing && <div className="qk-scanline" />}

              <div className="mb-8 flex items-center justify-between">
                <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-mist">
                  Live binding, try it
                </span>
                <span className="flex items-center gap-1.5 font-mono text-[10.5px] text-mist">
                  <span
                    className={`h-1.5 w-1.5 rounded-full transition-colors ${
                      running ? "animate-pulse bg-acid" : "bg-emerald-400"
                    }`}
                  />
                  {running ? "capturing" : "listening"}
                </span>
              </div>

              {/* keycaps */}
              <div className="flex items-center justify-center gap-5 md:gap-7">
                <button
                  aria-label="Alt key"
                  onMouseDown={() => setAltDown(true)}
                  onMouseUp={() => setAltDown(false)}
                  onMouseLeave={() => setAltDown(false)}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    setAltDown(true);
                  }}
                  onTouchEnd={() => setAltDown(false)}
                  className={`keycap h-24 w-32 md:h-28 md:w-40 ${altDown ? "pressed" : ""}`}
                >
                  <span className="font-mono text-lg font-semibold tracking-[0.2em] text-fg/75 md:text-xl">
                    ALT
                  </span>
                </button>
                <span className="font-mono text-2xl font-light text-fg/25">+</span>
                <button
                  aria-label="Q key"
                  onMouseDown={() => {
                    setQDown(true);
                    runSequence();
                  }}
                  onMouseUp={() => setQDown(false)}
                  onMouseLeave={() => setQDown(false)}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    setQDown(true);
                    runSequence();
                  }}
                  onTouchEnd={() => setQDown(false)}
                  className={`keycap h-24 w-24 md:h-28 md:w-28 ${qDown ? "pressed" : ""}`}
                >
                  <span className="font-mono text-3xl font-bold text-acid [text-shadow:0_0_30px_rgba(180,240,60,0.5)] md:text-4xl">
                    Q
                  </span>
                </button>
              </div>

              {/* terminal */}
              <div className="mt-9 min-h-[152px] rounded-2xl border border-fg/[0.07] bg-panel p-4 font-mono text-[11.5px] leading-[1.9]">
                {log.length === 0 ? (
                  <p className="text-mist2">
                    <span className="text-acid">$</span> quizkey: waiting for input…
                    <span className="caret-blink ml-1 inline-block h-3.5 w-[7px] translate-y-0.5 bg-acid/80" />
                  </p>
                ) : (
                  log.map((line, i) => (
                    <motion.p
                      key={`${i}-${line.text}`}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.25 }}
                      className={toneClass[line.tone]}
                    >
                      {line.text}
                    </motion.p>
                  ))
                )}
              </div>

              <p className="mt-4 text-center font-mono text-[11px] text-mist">
                press{" "}
                <kbd className="rounded border border-fg/15 bg-fg/5 px-1.5 py-0.5 text-acid">Alt</kbd>{" "}
                +{" "}
                <kbd className="rounded border border-fg/15 bg-fg/5 px-1.5 py-0.5 text-acid">Q</kbd>{" "}
                on your real keyboard, or click the caps
              </p>
            </div>
          </motion.div>
        </div>
      </div>

      {/* marquee */}
      <div className="relative border-y border-fg/[0.06] bg-fg/[0.015] py-3.5">
        <div className="marquee-track gap-10">
          {[...MARQUEE, ...MARQUEE].map((item, i) => (
            <span
              key={i}
              className="flex items-center gap-10 whitespace-nowrap font-mono text-[11.5px] text-mist2"
            >
              {item}
              <span className="h-1 w-1 rounded-full bg-acid/50" />
            </span>
          ))}
        </div>
      </div>

      <div className="flex justify-center py-6">
        <ArrowDown size={16} className="animate-bounce text-mist" />
      </div>
    </section>
  );
}
