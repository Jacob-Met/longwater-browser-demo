import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const styles = ["style.css", "journal.css", "watch-trends.css", "watch-save.css"];
const modules = ["pkg/longwater_web.js", "journal.js", "watch-save.js"];
const inputs = ["index.html", ...styles, "game.js", ...modules, "watch-trends.js", "pkg/longwater_web_bg.wasm"];
const sourceHash = createHash("sha256");
const files = new Map();
for (const name of inputs) {
  const bytes = await readFile(resolve(root, name));
  files.set(name, bytes);
  sourceHash.update(name).update("\0").update(bytes).update("\0");
}
const sourceSha256 = sourceHash.digest("hex");
const text = name => files.get(name).toString("utf8");
const dataUrl = (mime, content) => `data:${mime};base64,${Buffer.from(content).toString("base64")}`;

function replaceOnce(source, needle, replacement) {
  if (source.indexOf(needle) < 0 || source.indexOf(needle) !== source.lastIndexOf(needle)) {
    throw new Error(`Packaging expected exactly one ${JSON.stringify(needle)}; source was not rewritten.`);
  }
  return source.replace(needle, () => replacement);
}

let game = text("game.js");
const journal = replaceOnce(text("journal.js"), JSON.stringify("./watch-trends.js"), JSON.stringify(dataUrl("text/javascript", files.get("watch-trends.js"))));
for (const name of modules) {
  game = replaceOnce(game, JSON.stringify(`./${name}`), JSON.stringify(dataUrl("text/javascript", name === "journal.js" ? journal : files.get(name))));
}
game = replaceOnce(game, "await init();", `await init({ module_or_path: Uint8Array.from(atob(${JSON.stringify(files.get("pkg/longwater_web_bg.wasm").toString("base64"))}), c => c.charCodeAt(0)) });`);
let html = text("index.html");
const downloadPanels = html.match(/    <!-- offline-download:start -->[\s\S]*?    <!-- offline-download:end -->/g) ?? [];
if (downloadPanels.length !== 1) throw new Error("Packaging expected exactly one online download panel.");
html = replaceOnce(html, downloadPanels[0], `    <section id="offline-copy" class="offline-copy" aria-labelledby="offline-copy-title">
      <h2 id="offline-copy-title">Your offline copy</h2>
      <p>When the save message confirms success, reopen this same file in this browser to resume your watch and its journal.</p>
    </section>`);
for (const name of styles) {
  html = replaceOnce(html, `href="./${name}"`, `href="${dataUrl("text/css", files.get(name))}"`);
}
html = replaceOnce(html, 'src="./game.js"', `src="${dataUrl("text/javascript", game)}"`);
html = replaceOnce(html, "</head>", `  <meta name="longwater-source-sha256" content="${sourceSha256}">\n</head>`);

const output = resolve(process.argv[2] ?? resolve(root, "dist/Longwater-Fourteen-Tides.html"));
await mkdir(dirname(output), { recursive: true });
await writeFile(output, html);
console.log(JSON.stringify({
  file: output,
  bytes: Buffer.byteLength(html),
  sha256: createHash("sha256").update(html).digest("hex"),
  sourceSha256,
  inputs,
}));
