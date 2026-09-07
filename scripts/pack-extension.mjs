/**
 * scripts/pack-extension.mjs
 * Zips ./extension into ./public/quizkey-extension.zip so the site's
 * "Download .zip" buttons serve the exact code shown in the source explorer.
 * Runs automatically before `vite build` / `vite dev` (see package.json).
 */
import { createWriteStream, mkdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import archiver from "archiver";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "extension");
const outDir = path.join(root, "public");
const out = path.join(outDir, "quizkey-extension.zip");

mkdirSync(outDir, { recursive: true });

await new Promise((resolve, reject) => {
  const output = createWriteStream(out);
  const archive = archiver("zip", { zlib: { level: 9 } });
  output.on("close", resolve);
  archive.on("error", reject);
  archive.pipe(output);
  // Everything lands under a top-level "extension/" folder, matching the README.
  archive.directory(src, "extension");
  archive.finalize();
});

const kb = Math.round(statSync(out).size / 1024);
console.log(`✓ packed extension/ → public/quizkey-extension.zip (${kb} KB)`);
