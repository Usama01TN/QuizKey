import { motion } from "framer-motion";
import {
  AlertTriangle,
  Keyboard,
  Lock,
  ScanLine,
  Settings2,
  Timer,
} from "lucide-react";

const EVENT_CHAIN = ["keydown", "keypress", "beforeinput", "input", "keyup"];

const JITTER_BARS = [42, 68, 55, 90, 61, 48, 74, 51, 96, 66, 44, 70, 58, 84, 47, 63, 77, 52];

const ERROR_CODES = [
  ["CAPTURE_FAILED", "toast + badge"],
  ["NO_QUESTION", "retry hint"],
  ["NO_INPUT", "focus fallback"],
  ["API_TIMEOUT", "abort → toast"],
];

const PERMISSIONS = [
  ["activeTab", "granted by your shortcut press"],
  ["storage", "settings + per-tab results"],
  ["commands", "the two shortcuts"],
  ["host: api.openai.com", "AI calls stay in background"],
];

const fade = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
};

function Card({
  className = "",
  delay = 0,
  children,
}: {
  className?: string;
  delay?: number;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      {...fade}
      transition={{ duration: 0.6, delay }}
      className={`group relative overflow-hidden rounded-3xl border border-fg/[0.08] bg-panel p-7 transition-colors hover:border-fg/[0.16] ${className}`}
    >
      {children}
    </motion.div>
  );
}

function IconBadge({ icon: Icon }: { icon: typeof Keyboard }) {
  return (
    <span className="mb-5 inline-grid h-11 w-11 place-items-center rounded-2xl border border-acid/25 bg-acid/[0.08] text-acid transition-transform duration-300 group-hover:scale-110">
      <Icon size={19} />
    </span>
  );
}

export default function Features() {
  return (
    <section id="features" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <div className="mb-14 max-w-2xl">
          <p className="mb-3 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.25em] text-acid">
            <span className="h-px w-8 bg-acid/60" /> Capabilities
          </p>
          <h2 className="text-4xl font-bold tracking-tight md:text-5xl">
            Engineered like a <span className="text-acid">tool,</span> not a trick.
          </h2>
        </div>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {/* 1. Real key events (wide) */}
          <Card className="md:col-span-2" delay={0}>
            <IconBadge icon={Keyboard} />
            <h3 className="text-xl font-bold">Real keyboard events, never a paste</h3>
            <p className="mt-2 max-w-md text-[13.5px] leading-relaxed text-mist">
              Every character walks the full native path, mutating the value through the
              platform setter so React, Vue and Angular controlled inputs all catch it,
              including <code className="font-mono text-[11px] text-acid-soft">preventDefault()</code> handling.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-1.5">
              {EVENT_CHAIN.map((ev, i) => (
                <span key={ev} className="flex items-center gap-1.5">
                  <span className="rounded-lg border border-fg/10 bg-fg/[0.04] px-3 py-1.5 font-mono text-[11px] text-fg/85 transition-colors group-hover:border-acid/30">
                    {ev}
                  </span>
                  {i < EVENT_CHAIN.length - 1 && (
                    <span className="font-mono text-[11px] text-acid">→</span>
                  )}
                </span>
              ))}
              <span className="ml-2 rounded-lg border border-acid/30 bg-acid/10 px-3 py-1.5 font-mono text-[11px] font-bold text-acid">
                × per character
              </span>
            </div>
          </Card>

          {/* 2. Vision */}
          <Card delay={0.08}>
            <IconBadge icon={ScanLine} />
            <h3 className="text-xl font-bold">Screenshot → structured answer</h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-mist">
              The visible tab goes to any OpenAI-compatible vision endpoint. The reply is
              validated JSON: question, options, best answer, confidence.
            </p>
            <div className="mt-6 space-y-1.5 font-mono text-[11px]">
              <p className="text-viol">"inputKind": "choice"</p>
              <p className="text-fg/70">"correctAnswerId": "C"</p>
              <p className="text-acid">"confidence": 0.97</p>
            </div>
          </Card>

          {/* 3. Cadence */}
          <Card delay={0.13}>
            <IconBadge icon={Timer} />
            <h3 className="text-xl font-bold">Human typing cadence</h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-mist">
              Configurable base delay plus random jitter, with longer breaths at word
              boundaries and after punctuation.
            </p>
            <div className="mt-6 flex h-16 items-end gap-1.5">
              {JITTER_BARS.map((h, i) => (
                <motion.span
                  key={i}
                  initial={{ height: 0 }}
                  whileInView={{ height: `${h}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: 0.03 * i }}
                  className={`w-full rounded-sm ${i === 8 ? "bg-acid" : "bg-fg/15"}`}
                />
              ))}
            </div>
            <p className="mt-2 font-mono text-[10px] text-mist">
              delay(t) = base + rand(0…jitter) × pause multipliers
            </p>
          </Card>

          {/* 4. Configurable */}
          <Card delay={0.18}>
            <IconBadge icon={Settings2} />
            <h3 className="text-xl font-bold">Configurable everything</h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-mist">
              Shortcuts, endpoint, model, capture format, JPEG quality, typing speed,
              overlay position, auto-type and click behavior.
            </p>
            <div className="mt-6 flex flex-wrap gap-1.5">
              {["Alt+Q", "Alt+A", "60ms ±45", "jpeg:85", "gpt-4o-mini", "auto-type"].map((chip) => (
                <span
                  key={chip}
                  className="rounded-md border border-fg/10 bg-fg/[0.04] px-2.5 py-1 font-mono text-[10.5px] text-fg/75"
                >
                  {chip}
                </span>
              ))}
            </div>
          </Card>

          {/* 5. Errors */}
          <Card delay={0.23}>
            <IconBadge icon={AlertTriangle} />
            <h3 className="text-xl font-bold">Typed errors, graceful exits</h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-mist">
              Every failure is a <code className="font-mono text-[11px] text-acid-soft">QuizKeyError</code> with
              a stable code and a user message, shown as a toast and mirrored on the badge.
            </p>
            <div className="mt-6 space-y-1">
              {ERROR_CODES.map(([code, act]) => (
                <div
                  key={code}
                  className="flex items-center justify-between rounded-lg bg-fg/[0.03] px-3 py-1.5 font-mono text-[10.5px]"
                >
                  <span className="text-red-300/90">{code}</span>
                  <span className="text-mist">{act}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* 6. Security */}
          <Card delay={0.28}>
            <IconBadge icon={Lock} />
            <h3 className="text-xl font-bold">Manifest V3, minimal trust</h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-mist">
              Module service worker, isolated content scripts, no eval, no remote code.
              The API key lives in <code className="font-mono text-[11px] text-acid-soft">chrome.storage.local</code> and
              never enters page context.
            </p>
            <div className="mt-6 space-y-1">
              {PERMISSIONS.map(([perm, why]) => (
                <div
                  key={perm}
                  className="flex items-center justify-between rounded-lg bg-fg/[0.03] px-3 py-1.5 font-mono text-[10.5px]"
                >
                  <span className="text-acid">{perm}</span>
                  <span className="text-right text-mist">{why}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}
