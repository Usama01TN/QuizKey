import { memo, useMemo } from "react";
import type { ReactNode } from "react";
import type { Lang } from "./sources";

/**
 * Tiny purpose-built tokenizer for the code explorer — no external deps.
 * It is intentionally approximate: it colors comments, strings, keywords,
 * numbers, calls, properties and tags, which is plenty for readability.
 */

const JS_RE = new RegExp(
  [
    /(?<com>\/\/[^\n]*|\/\*[\s\S]*?\*\/)/.source,
    /(?<str>'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\[\s\S]|\n)*?`)/.source,
    /(?<chrome>chrome\.[\w.]+)/.source,
    /(?<kw>\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|super|this|typeof|instanceof|in|of|try|catch|finally|throw|async|await|import|export|from|default|static|get|set|void|delete|yield|null|undefined|true|false)\b)/.source,
    /(?<num>\b\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?\b)/.source,
    /(?<call>[A-Za-z_$][\w$]*(?=\s*\())/.source,
    /(?<prop>[A-Za-z_$][\w$]*(?=\s*:))/.source,
    /(?<punct>[{}[\]();,.<>=!?:&|+\-*/%@#~^]+)/.source,
  ].join("|"),
  "g"
);

const JSON_RE = new RegExp(
  [
    /(?<prop>"(?:[^"\\]|\\.)*"(?=\s*:))/.source,
    /(?<str>"(?:[^"\\]|\\.)*")/.source,
    /(?<num>-?\b\d+(?:\.\d+)?\b)/.source,
    /(?<kw>\b(?:true|false|null)\b)/.source,
    /(?<punct>[{}[\],:]+)/.source,
  ].join("|"),
  "g"
);

const HTML_RE = new RegExp(
  [
    /(?<com><!--[\s\S]*?-->)/.source,
    /(?<str>"[^"\n]*")/.source,
    /(?<attr>[\w-]+(?==))/.source,
    /(?<tag><\/?!?[\w-]+|\/>|>)/.source,
  ].join("|"),
  "g"
);

const CSS_RE = new RegExp(
  [
    /(?<com>\/\*[\s\S]*?\*\/)/.source,
    /(?<sel>[^{}\s][^{}]*(?=\{))/.source,
    /(?<prop>[a-zA-Z-]+(?=\s*:))/.source,
    /(?<str>"[^"\n]*"|'[^'\n]*')/.source,
    /(?<num>-?\d[\d.]*(?:px|em|rem|%|ms|s|vh|vw|deg|fr)?\b)/.source,
    /(?<kw>#[0-9a-fA-F]{3,8}\b|!important|@[\w-]+)/.source,
    /(?<punct>[{}();:,>+~[\]*]|\.[\w-]+)/.source,
  ].join("|"),
  "g"
);

const CLASS_MAP: Record<string, string> = {
  com: "tok-com",
  str: "tok-str",
  kw: "tok-kw",
  num: "tok-num",
  call: "tok-call",
  prop: "tok-prop",
  punct: "tok-punct",
  tag: "tok-tag",
  attr: "tok-attr",
  chrome: "tok-chrome",
  sel: "tok-tag",
};

const REGEX_MAP: Record<Lang, RegExp | null> = {
  js: JS_RE,
  json: JSON_RE,
  html: HTML_RE,
  css: CSS_RE,
  md: null,
};

interface Token {
  text: string;
  cls: string;
}

function tokenize(code: string, lang: Lang): Token[] {
  const re = REGEX_MAP[lang];
  if (!re) return [{ text: code, cls: "tok-plain" }];

  const tokens: Token[] = [];
  let last = 0;
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    const match = m;
    if (match.index > last) tokens.push({ text: code.slice(last, match.index), cls: "tok-plain" });
    const groups = match.groups ?? {};
    const group = Object.keys(groups).find((k) => groups[k] !== undefined) ?? "";
    tokens.push({ text: match[0], cls: CLASS_MAP[group] || "tok-plain" });
    last = m.index + m[0].length;
    if (m[0] === "") re.lastIndex += 1; // guard against empty matches
  }
  if (last < code.length) tokens.push({ text: code.slice(last), cls: "tok-plain" });
  return tokens;
}

function toLines(tokens: Token[]): ReactNode[][] {
  const lines: ReactNode[][] = [[]];
  let key = 0;
  for (const tok of tokens) {
    const parts = tok.text.split("\n");
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) {
        lines[lines.length - 1].push(
          <span key={key++} className={tok.cls}>
            {part}
          </span>
        );
      }
    });
  }
  return lines;
}

export const CodeBlock = memo(function CodeBlock({
  code,
  lang,
  showLineNumbers = true,
}: {
  code: string;
  lang: Lang;
  showLineNumbers?: boolean;
}) {
  const lines = useMemo(() => toLines(tokenize(code, lang)), [code, lang]);

  return (
    <pre className="font-mono text-[12.5px] leading-[1.7]">
      {lines.map((line, i) => (
        <div key={i} className="flex px-4 hover:bg-fg/[0.025]">
          {showLineNumbers && (
            <span className="sticky left-0 w-8 shrink-0 select-none pr-4 text-right text-[var(--mist2)]">
              {i + 1}
            </span>
          )}
          <code className="whitespace-pre">{line.length ? line : " "}</code>
        </div>
      ))}
    </pre>
  );
});
