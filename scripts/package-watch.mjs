import { constants } from "node:fs";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { link, lstat, mkdtemp, open, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}
function replaceOnce(text, needle, replacement) {
  requireCondition(text.indexOf(needle) >= 0 && text.indexOf(needle) === text.lastIndexOf(needle),
    "Expected one " + needle + " in the unchanged offline game.");
  return text.replace(needle, () => replacement);
}
function sameFile(a, b) {
  return a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeNs === b.mtimeNs;
}
async function readSelected(file, maxLength) {
  const observed = await lstat(file, { bigint: true });
  requireCondition(observed.isFile(), "Choose a regular watch file, not a directory or symbolic link.");
  requireCondition(observed.size <= BigInt(maxLength), "Choose a watch file up to 32 KiB.");
  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = await handle.stat({ bigint: true });
    requireCondition(sameFile(observed, before), "The selected watch changed while opening it.");
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    requireCondition(sameFile(before, after) && bytes.length <= maxLength,
      "The selected watch changed while reading it.");
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { bytes, raw, identity: after };
  } finally { await handle.close(); }
}
async function requireAbsent(file) {
  try { await lstat(file); }
  catch (error) { if (error.code === "ENOENT") return; throw error; }
  throw new Error("The output already exists. Choose a new filename; no file was replaced.");
}

function dataModule(bytes) {
  return import("data:text/javascript;base64," + bytes.toString("base64"));
}
function decodeBase64(encoded) {
  const bytes = Buffer.from(encoded, "base64");
  requireCondition(bytes.toString("base64") === encoded, "Unsupported packaged validation encoding.");
  return bytes;
}
function requireOne(text, expression, label) {
  const matches = [...text.matchAll(expression)];
  requireCondition(matches.length === 1, "Expected exactly one recognized packaged " + label + " binding.");
  return matches[0][1];
}
function verifyPackagedValidation(entryURL, captured) {
  const entry = decodeBase64(entryURL.slice("data:text/javascript;base64,".length)).toString("utf8");
  const embedded = {
    watchSave: decodeBase64(requireOne(entry,
      /^import \{ SavedWatch, WATCH_SAVE_KEY, MAX_SAVE_LENGTH \} from "data:text\/javascript;base64,([^"]+)";$/gm, "SavedWatch")),
    glue: decodeBase64(requireOne(entry,
      /^import init, \{ BrowserSession \} from "data:text\/javascript;base64,([^"]+)";$/gm, "simulation glue")),
    wasm: decodeBase64(requireOne(entry,
      /await init\(\{ module_or_path: Uint8Array\.from\(atob\("([^"]+)"\), c => c\.charCodeAt\(0\)\) \}\);/g, "WASM initialization")),
  };
  for (const key of ["watchSave", "glue", "wasm"]) {
    requireCondition(embedded[key].equals(captured[key]),
      "The packaged " + key + " validation source differs from the executed snapshot; no output was published.");
  }
  return {
    watchSaveSha256: sha(captured.watchSave),
    glueSha256: sha(captured.glue),
    wasmSha256: sha(captured.wasm),
  };
}

async function packageWatch(input, output) {
  await requireAbsent(output);
  // Execute these captured bytes, not a possibly cached file-URL module.
  // The artifact comparison below also catches child changes restored on disk.
  const captured = {
    watchSave: await readFile(join(root, "watch-save.js")),
    glue: await readFile(join(root, "pkg/longwater_web.js")),
    wasm: await readFile(join(root, "pkg/longwater_web_bg.wasm")),
  };
  const [{ SavedWatch, MAX_SAVE_LENGTH }, { default: init, BrowserSession }] =
    await Promise.all([dataModule(captured.watchSave), dataModule(captured.glue)]);
  const selected = await readSelected(input, MAX_SAVE_LENGTH);
  await init({ module_or_path: captured.wasm });
  const watch = new SavedWatch({
    createSession: () => new BrowserSession(),
    getStorage: () => ({ getItem: () => null, setItem() { throw new Error("Packaging cannot write a browser save."); } }),
  });
  let preview;
  try { preview = watch.previewFile(selected.raw); }
  finally { watch.free(); }

  const parent = dirname(output);
  const parentReal = await realpath(parent);
  const parentIdentity = await stat(parentReal, { bigint: true });
  requireCondition(parentIdentity.isDirectory(), "The output parent must be an existing directory.");
  const stage = await mkdtemp(join(parentReal, ".longwater-watch-"));
  let published = false;
  let receipt;
  try {
    const ordinary = join(stage, "game.html");
    const packaged = await run(process.execPath, [join(root, "scripts/package.mjs"), ordinary],
      { cwd: root, timeout: 30000, maxBuffer: 1024 * 1024 });
    const originalReceipt = JSON.parse(packaged.stdout.trim());
    const gameBytes = await readFile(ordinary);
    requireCondition(originalReceipt.sha256 === sha(gameBytes) && originalReceipt.bytes === gameBytes.length,
      "The ordinary game did not match its packaging receipt.");
    const game = gameBytes.toString("utf8");
    const entries = [...game.matchAll(/<script type="module" src="(data:text\/javascript;base64,[^"]+)"><\/script>/g)];
    requireCondition(entries.length === 1, "Expected one unchanged offline game module.");
    const validation = verifyPackagedValidation(entries[0][1], captured);
    const controller = await readFile(join(root, "included-watch.js"));
    const controllerURL = "data:text/javascript;base64," + controller.toString("base64");
    const payload = JSON.stringify({ name: basename(input), watchBase64: selected.bytes.toString("base64") })
      .replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    const controls = [
      '    <section id="included-watch" class="watch-files" aria-labelledby="included-watch-title" style="overflow-wrap:anywhere">',
      '      <h2 id="included-watch-title">Included watch</h2>',
      '      <p id="included-watch-name"></p>',
      '      <p>This file includes a saved watch. Review it before choosing whether to replace your current watch.</p>',
      '      <div class="watch-file-actions"><button id="included-watch-review" type="button" disabled>Review included watch</button></div>',
      '      <p id="included-watch-status" role="status" aria-live="polite">Waiting for Longwater to start…</p>',
      '    </section>',
      '',
    ].join("\n");
    let html = replaceOnce(game, "</main>", controls + "  </main>");
    html = replaceOnce(html, "</body>", [
      '  <script id="included-watch-data" type="application/json">' + payload + '</script>',
      '  <script type="module">',
      'import { initializeIncludedWatch } from ' + JSON.stringify(controllerURL) + ';',
      'await initializeIncludedWatch();',
      '  </script>',
      '</body>',
    ].join("\n"));
    const bytes = Buffer.from(html, "utf8");
    const stagedOutput = join(stage, "handoff.html");
    await writeFile(stagedOutput, bytes, { flag: "wx", mode: 0o600 });

    const currentInput = await readSelected(input, MAX_SAVE_LENGTH);
    requireCondition(sameFile(selected.identity, currentInput.identity) && selected.bytes.equals(currentInput.bytes),
      "The selected watch changed before publication; no output was published.");
    const currentParent = await stat(parentReal, { bigint: true });
    requireCondition(await realpath(parent) === parentReal
      && currentParent.dev === parentIdentity.dev && currentParent.ino === parentIdentity.ino,
    "The output directory changed before publication.");
    // The private staged file shares the destination filesystem. link is
    // exclusive: an existing regular file or symlink is never overwritten.
    await link(stagedOutput, output);
    published = true;
    receipt = {
      file: output,
      bytes: bytes.length,
      sha256: sha(bytes),
      input: { file: input, bytes: selected.bytes.length, sha256: sha(selected.bytes) },
      watch: { day: preview.day, selected: JSON.parse(selected.raw).selected },
      game: { bytes: gameBytes.length, sha256: sha(gameBytes), sourceSha256: originalReceipt.sourceSha256 },
      controllerSha256: sha(controller),
      validation,
    };
  } finally {
    // Only this invocation's private stage is removed. The selected watch and
    // final destination are never cleanup targets.
    try { await rm(stage, { recursive: true, force: true }); }
    catch (error) {
      if (!published) throw error;
      receipt.cleanupWarning = "The handoff was published, but its private staging directory could not be removed.";
    }
  }
  return receipt;
}

const args = process.argv.slice(2);
if (args.length !== 3 || args[1] !== "--output" || !args[0] || !args[2]) {
  console.error("Usage: node scripts/package-watch.mjs selected-watch.json --output new-handoff.html");
  process.exitCode = 1;
} else {
  try { console.log(JSON.stringify(await packageWatch(resolve(args[0]), resolve(args[2])))); }
  catch (error) {
    console.error("The watch handoff could not be created: " + String(error.message || error));
    process.exitCode = 1;
  }
}
