import { motion } from "framer-motion";
import { ArrowUpRight, Coffee, HeartHandshake, Wallet } from "lucide-react";

const fade = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
};

export const DONATIONS = [
  {
    id: "ba9chich",
    name: "Ba9chich",
    handle: "@IninouUsama",
    url: "https://ba9chich.com/IninouUsama",
    icon: Wallet,
    blurb: "Tunisian tipping platform. Pays out in TND and accepts local cards, e-DINAR and Flouci. The easiest option if you're in Tunisia.",
    tags: ["TND", "Local cards", "Flouci", "e-DINAR", "PayPal"],
    accent: "acid" as const,
  },
  {
    id: "kofi",
    name: "Ko-fi",
    handle: "ko-fi.com/usamatn",
    url: "https://ko-fi.com/usamatn",
    icon: Coffee,
    blurb: "International support via card, Apple Pay or PayPal. One-off tips or a monthly membership, no account needed to give.",
    tags: ["Card", "PayPal", "Monthly"],
    accent: "viol" as const,
  },
];

export default function Support() {
  return (
    <section id="support" className="relative py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <div className="mb-14 max-w-2xl">
          <p className="mb-3 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.25em] text-acid">
            <span className="h-px w-8 bg-acid/60" /> Support
          </p>
          <h2 className="text-[34px] font-bold leading-[1.1] tracking-tight md:text-[46px]">
            Keep QuizKey{" "}
            <span className="text-acid">free and open</span>
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-mist">
            QuizKey ships with no telemetry, no accounts and no paywall. It runs entirely on
            your own API key. If it saved you some time, a tip covers the hosting and the
            coffee behind the next release.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {DONATIONS.map(({ id, name, handle, url, icon: Icon, blurb, tags, accent }, i) => {
            const ring = accent === "acid" ? "border-acid/25 bg-acid/[0.08] text-acid" : "border-viol/25 bg-viol/[0.08] text-viol";
            const glow =
              accent === "acid"
                ? "hover:border-acid/40 hover:shadow-[0_0_44px_-14px_rgba(180,240,60,0.45)]"
                : "hover:border-viol/40 hover:shadow-[0_0_44px_-14px_rgba(139,140,248,0.45)]";

            return (
              <motion.a
                key={id}
                {...fade}
                transition={{ duration: 0.6, delay: i * 0.1 }}
                href={url}
                target="_blank"
                rel="noreferrer noopener"
                className={`group relative flex flex-col overflow-hidden rounded-3xl border border-fg/[0.08] bg-panel p-7 transition-all duration-300 ${glow}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <span
                    className={`inline-grid h-11 w-11 place-items-center rounded-2xl border transition-transform duration-300 group-hover:scale-110 ${ring}`}
                  >
                    <Icon size={19} />
                  </span>
                  <ArrowUpRight
                    size={18}
                    className="text-mist2 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-fg"
                  />
                </div>

                <h3 className="mt-5 text-[19px] font-bold tracking-tight">{name}</h3>
                <p className="mt-1 font-mono text-[11px] text-acid-soft">{handle}</p>
                <p className="mt-3 flex-1 text-[13.5px] leading-relaxed text-mist">{blurb}</p>

                <div className="mt-5 flex flex-wrap gap-2">
                  {tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-lg border border-fg/10 bg-panel2 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-mist"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </motion.a>
            );
          })}
        </div>

        <motion.p
          {...fade}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-6 flex items-center justify-center gap-2 text-center font-mono text-[11px] text-mist2"
        >
          <HeartHandshake size={13} className="text-acid/70" />
          Donations are entirely optional. Starring the repo helps just as much.
        </motion.p>
      </div>
    </section>
  );
}
