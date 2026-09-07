/**
 * Registry that pulls the REAL extension sources into the site as raw text
 * so the code explorer always shows exactly what ships in /extension.
 */
import manifest from "../../extension/manifest.json?raw";
import background from "../../extension/background/service-worker.js?raw";
import aiClient from "../../extension/lib/ai-client.js?raw";
import providers from "../../extension/lib/providers.js?raw";
import httpLib from "../../extension/lib/http.js?raw";
import analysis from "../../extension/lib/analysis.js?raw";
import adapterOpenAI from "../../extension/lib/adapters/openai.js?raw";
import adapterGemini from "../../extension/lib/adapters/gemini.js?raw";
import adapterAnthropic from "../../extension/lib/adapters/anthropic.js?raw";
import storage from "../../extension/lib/storage.js?raw";
import prompts from "../../extension/lib/prompts.js?raw";
import errors from "../../extension/lib/errors.js?raw";
import pageAccess from "../../extension/lib/page-access.js?raw";
import contentScript from "../../extension/content/content-script.js?raw";
import domDetector from "../../extension/content/dom-detector.js?raw";
import typingSim from "../../extension/content/typing-simulator.js?raw";
import overlay from "../../extension/content/overlay.js?raw";
import overlayCss from "../../extension/content/overlay.css?raw";
import popupHtml from "../../extension/popup/popup.html?raw";
import popupCss from "../../extension/popup/popup.css?raw";
import popupJs from "../../extension/popup/popup.js?raw";
import optionsHtml from "../../extension/options/options.html?raw";
import optionsCss from "../../extension/options/options.css?raw";
import optionsJs from "../../extension/options/options.js?raw";
import readme from "../../extension/README.md?raw";

export type Lang = "js" | "json" | "html" | "css" | "md";

export interface SourceFile {
  path: string;
  lang: Lang;
  code: string;
}

export const SOURCE_FILES: SourceFile[] = [
  { path: "manifest.json", lang: "json", code: manifest },
  { path: "background/service-worker.js", lang: "js", code: background },
  { path: "lib/storage.js", lang: "js", code: storage },
  { path: "lib/ai-client.js", lang: "js", code: aiClient },
  { path: "lib/providers.js", lang: "js", code: providers },
  { path: "lib/http.js", lang: "js", code: httpLib },
  { path: "lib/analysis.js", lang: "js", code: analysis },
  { path: "lib/adapters/openai.js", lang: "js", code: adapterOpenAI },
  { path: "lib/adapters/gemini.js", lang: "js", code: adapterGemini },
  { path: "lib/adapters/anthropic.js", lang: "js", code: adapterAnthropic },
  { path: "lib/prompts.js", lang: "js", code: prompts },
  { path: "lib/errors.js", lang: "js", code: errors },
  { path: "lib/page-access.js", lang: "js", code: pageAccess },
  { path: "content/content-script.js", lang: "js", code: contentScript },
  { path: "content/dom-detector.js", lang: "js", code: domDetector },
  { path: "content/typing-simulator.js", lang: "js", code: typingSim },
  { path: "content/overlay.js", lang: "js", code: overlay },
  { path: "content/overlay.css", lang: "css", code: overlayCss },
  { path: "popup/popup.html", lang: "html", code: popupHtml },
  { path: "popup/popup.css", lang: "css", code: popupCss },
  { path: "popup/popup.js", lang: "js", code: popupJs },
  { path: "options/options.html", lang: "html", code: optionsHtml },
  { path: "options/options.css", lang: "css", code: optionsCss },
  { path: "options/options.js", lang: "js", code: optionsJs },
  { path: "README.md", lang: "md", code: readme },
];

/** Indented tree used in the install section. */
export const PROJECT_TREE = `extension/
├── manifest.json
├── background/
│   └── service-worker.js
├── content/
│   ├── content-script.js
│   ├── dom-detector.js
│   ├── typing-simulator.js
│   ├── overlay.js
│   └── overlay.css
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── options/
│   ├── options.html
│   ├── options.css
│   └── options.js
├── lib/
│   ├── ai-client.js          # facade: analyzeScreenshot / testConnection / listModels
│   ├── providers.js          # verified provider registry (URLs, auth, dialect, models)
│   ├── http.js               # timeouts, keep-alive, error mapping, call log
│   ├── analysis.js           # model reply → analysis object
│   ├── adapters/
│   │   ├── openai.js         # Chat Completions dialect (+ OpenRouter, Ollama, LM Studio, Azure…)
│   │   ├── gemini.js         # Gemini native generateContent
│   │   └── anthropic.js      # Anthropic Messages
│   ├── prompts.js
│   ├── storage.js
│   ├── errors.js
│   └── page-access.js
├── icons/
│   └── icon.png
└── README.md`;
