import { motion } from "framer-motion";
import {
  Download,
  FolderOpen,
  KeyRound,
  KeyboardIcon,
  ListChecks,
  Terminal,
  ToggleRight,
} from "lucide-react";

const fade = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
};

const INSTALL_STEPS = [
  {
    icon: Download,
    title: "Get the source",
    body: "Download the packaged extension and unzip it anywhere.",
    code: "unzip quizkey-extension.zip && cd extension",
  },
  {
    icon: ToggleRight,
    title: "Enable Developer mode",
    body: "Open the extensions page and flip the Developer mode toggle (top-right).",
    code: "chrome://extensions",
  },
  {
    icon: FolderOpen,
    title: "Load unpacked",
    body: "Click “Load unpacked” and select the extension/ folder. Pin QuizKey to the toolbar.",
    code: "Manifest V3 · no build step required",
  },
  {
    icon: KeyboardIcon,
    title: "Bind your shortcuts",
    body: "Set the capture and type combos — or keep the defaults Alt+Q and Alt+A.",
    code: "chrome://extensions/shortcuts",
  },
];

const SETTINGS: [string, string, string][] = [
  ["provider", "string", "openai"],
  ["apiStyle", "auto | openai | gemini | anthropic", "auto"],
  ["apiBaseUrl", "string", "https://api.openai.com/v1"],
  ["apiKey", "string", "— (storage.local only)"],
  ["model", "string", "gpt-4o-mini"],
  ["requestTimeoutMs", "number", "90000"],
  ["maxOutputTokens", "number", "4096"],
  ["maxImageEdge", "number", "1600"],
  ["captureFormat", "png | jpeg", "jpeg"],
  ["jpegQuality", "0.1 – 1.0", "0.85"],
  ["typingDelayMs", "number", "60"],
  ["typingJitterMs", "number", "45"],
  ["autoType", "boolean", "false"],
  ["clickChoice", "boolean", "true"],
  ["highlightMatches", "boolean", "true"],
  ["extraInstructions", "string", "—"],
  ["overlayPosition", "enum", "top-right"],
];

export default function Docs() {
  return (
    <section id="install" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <div className="mb-14 max-w-2xl">
          <p className="mb-3 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.25em] text-acid">
            <span className="h-px w-8 bg-acid/60" /> Ship it
          </p>
          <h2 className="text-4xl font-bold tracking-tight md:text-5xl">
            Running in <span className="text-acid">ninety seconds.</span>
          </h2>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* ----------------------------- install ----------------------------- */}
          <motion.div
            {...fade}
            transition={{ duration: 0.6 }}
            className="rounded-3xl border border-white/[0.08] bg-panel p-7"
          >
            <div className="mb-7 flex items-center justify-between">
              <h3 className="flex items-center gap-2.5 text-lg font-bold">
                <Terminal size={17} className="text-acid" />
                Installation
              </h3>
              <a
                href="/quizkey-extension.zip"
                download
                className="flex items-center gap-1.5 rounded-lg border border-acid/35 bg-acid/10 px-3 py-1.5 font-mono text-[11px] font-bold text-acid transition-colors hover:bg-acid/20"
              >
                <Download size={12} />
                .zip
              </a>
            </div>

            <div className="space-y-6">
              {INSTALL_STEPS.map((step, i) => (
                <div key={step.title} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-acid/25 bg-acid/[0.07] font-mono text-[12px] font-bold text-acid">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {i < INSTALL_STEPS.length - 1 && (
                      <span className="mt-1 w-px flex-1 bg-white/[0.07]" />
                    )}
                  </div>
                  <div className="min-w-0 pb-1">
                    <p className="flex items-center gap-2 text-[14px] font-bold">
                      {step.title}
                    </p>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-mist">{step.body}</p>
                    <p className="mt-2.5 inline-flex max-w-full items-center gap-2 overflow-x-auto rounded-lg border border-white/[0.08] bg-[#0a0b11] px-3 py-2 font-mono text-[11px] text-acid-soft">
                      <span className="text-[#565b6c]">$</span>
                      <span className="whitespace-nowrap">{step.code}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-7 rounded-2xl border border-viol/25 bg-viol/[0.07] p-4">
              <p className="flex items-center gap-2 text-[12.5px] font-bold text-[#b8b9fa]">
                <KeyRound size={13} />
                First run
              </p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-mist">
                The options page opens automatically. Pick a provider preset, paste your API
                key, hit <span className="text-white">Test connection</span>, and QuizKey
                requests an optional host permission for that origin automatically.
              </p>
            </div>

            <div className="mt-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
              <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-mist">
                Provider quick-configs
              </p>
              <div className="space-y-2">
                {[
                  ["OpenAI", "api.openai.com/v1", "gpt-4o-mini · gpt-5.6-terra", "Chat Completions"],
                  ["Anthropic Claude", "api.anthropic.com/v1", "claude-sonnet-5", "Messages API (native)"],
                  ["Google Gemini", "generativelanguage.googleapis.com/v1beta", "gemini-3.8-flash", "generateContent (native)"],
                  ["Gemini · OpenAI layer", "generativelanguage.googleapis.com/v1beta/openai", "gemini-3.8-flash", "Chat Completions (beta)"],
                  ["OpenRouter", "openrouter.ai/api/v1", "openai/gpt-4o-mini", "Chat Completions"],
                  ["OmniRoute · local gateway", "localhost:20128/v1", "gemini-3-flash", "Chat Completions"],
                  ["LM Studio · local", "localhost:1234/v1", "(empty → first loaded)", "Chat Completions"],
                  ["Ollama · local", "localhost:11434/v1", "llama3.2-vision", "Chat Completions"],
                ].map(([name, url, model, badge]) => (
                  <div key={name as string} className="flex flex-col gap-0.5 rounded-xl bg-[#0a0b11] px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <span className="flex items-center gap-2 text-[12px] font-bold text-white/90">
                      {name as string}
                      {badge ? (
                        <span className="rounded-full bg-acid/15 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-acid">
                          {badge as string}
                        </span>
                      ) : null}
                    </span>
                    <span className="font-mono text-[10.5px] text-mist">
                      {url as string} · <span className="text-acid-soft">{model as string}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* ----------------------------- settings ----------------------------- */}
          <motion.div
            {...fade}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="overflow-hidden rounded-3xl border border-white/[0.08] bg-panel"
          >
            <div className="flex items-center gap-2.5 border-b border-white/[0.07] px-7 py-5">
              <ListChecks size={16} className="text-acid" />
              <h3 className="text-lg font-bold">Settings reference</h3>
              <span className="ml-auto font-mono text-[10.5px] text-[#565b6c]">
                chrome.storage.local · quizkey.settings
              </span>
            </div>
            <div className="code-scroll max-h-[520px] overflow-y-auto">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-panel">
                  <tr className="border-b border-white/[0.07] font-mono text-[10px] uppercase tracking-[0.15em] text-[#565b6c]">
                    <th className="px-7 py-3 font-semibold">Key</th>
                    <th className="py-3 pr-4 font-semibold">Type</th>
                    <th className="py-3 pr-7 font-semibold">Default</th>
                  </tr>
                </thead>
                <tbody>
                  {SETTINGS.map(([key, type, def]) => (
                    <tr
                      key={key}
                      className="border-b border-white/[0.045] transition-colors hover:bg-white/[0.02]"
                    >
                      <td className="px-7 py-2.5 font-mono text-[12px] font-semibold text-acid-soft">
                        {key}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-[11px] text-viol/90">{type}</td>
                      <td className="max-w-0 truncate py-2.5 pr-7 font-mono text-[11px] text-mist">
                        {def}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        </div>

        {/* ethics / notes strip */}
        <motion.div
          {...fade}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="mt-6 grid gap-6 rounded-3xl border border-white/[0.08] bg-panel p-7 sm:grid-cols-2 xl:grid-cols-4"
        >
          {[
            [
              "Restricted: system pages",
              "chrome:// settings, history, new tab, the PDF viewer and other extensions' pages can't be captured or scripted by ANY extension — a Chromium security rule, not a bug. The popup names the exact page kind.",
            ],
            [
              "Restricted: Web Store",
              "Extension galleries (chromewebstore.google.com, Edge Add-ons…) block scripting too. Open any normal http(s) site and run QuizKey there.",
            ],
            [
              "Local files (file://)",
              "Capture works out of the box. Typing needs a grant: QuizKey Settings → “Enable file access” (one click). Chrome's own “Allow access to file URLs” toggle may be hidden — it only renders when a declared URL permission exists, and QuizKey asks at runtime instead.",
            ],
            [
              "Tab open before install?",
              "Its content script is missing — QuizKey now auto-injects on capture via chrome.scripting. If you still see a messaging error, reload that tab once.",
            ],
          ].map(([title, body]) => (
            <div key={title}>
              <p className="mb-1.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] text-acid">
                {title}
              </p>
              <p className="text-[12.5px] leading-relaxed text-mist">{body}</p>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
