import test from "node:test";
import assert from "node:assert/strict";
import { cp, copyFile, mkdtemp, readFile, readdir, writeFile, mkdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const project = resolve(process.env.LONGWATER_SOURCE_ROOT ?? fileURLToPath(new URL("..", import.meta.url)));
const work = await mkdtemp(join(tmpdir(), "longwater-source-binding-"));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const { default: init, BrowserSession } = await import(pathToFileURL(join(project, "pkg/longwater_web.js")));
const { SavedWatch } = await import(pathToFileURL(join(project, "watch-save.js")));
await init({ module_or_path: await readFile(join(project, "pkg/longwater_web_bg.wasm")) });
let saved = null;
const donor = new SavedWatch({ createSession: () => new BrowserSession(),
  getStorage: () => ({ getItem: () => saved, setItem(_key, value) { saved = value; } }) });
donor.select(1); donor.takeTurn("gate"); donor.select(0);
const watchRaw = donor.exportFile();
donor.free();

async function fixture(label) {
  const root = await mkdtemp(join(work, label + "-"));
  for (const item of await readdir(project, { withFileTypes: true })) {
    if (item.isFile() && (/\.(js|css|html)$/.test(item.name) || item.name === "package.json")) {
      await copyFile(join(project, item.name), join(root, item.name));
    }
  }
  await cp(join(project, "pkg"), join(root, "pkg"), { recursive: true });
  await mkdir(join(root, "scripts"));
  for (const file of ["package.mjs", "package-watch.mjs"]) await copyFile(join(project, "scripts", file), join(root, "scripts", file));
  const input = join(root, "selected.json"), output = join(root, "handoff.html");
  await writeFile(input, watchRaw);
  return { root, input, output };
}
function run(f, options = []) {
  return spawnSync(process.execPath, [...options, join(f.root, "scripts/package-watch.mjs"), f.input, "--output", f.output],
    { cwd: f.root, encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024 });
}
async function exists(path) {
  try { await stat(path); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; }
}
function decodeBindings(html) {
  const gameURLs = [...html.matchAll(/<script type="module" src="(data:text\/javascript;base64,[^"]+)"><\/script>/g)];
  assert.equal(gameURLs.length, 1);
  const game = Buffer.from(gameURLs[0][1].split(",")[1], "base64").toString("utf8");
  const save = [...game.matchAll(/^import \{ SavedWatch, WATCH_SAVE_KEY, MAX_SAVE_LENGTH \} from "data:text\/javascript;base64,([^"]+)";$/gm)];
  const glue = [...game.matchAll(/^import init, \{ BrowserSession \} from "data:text\/javascript;base64,([^"]+)";$/gm)];
  const wasm = [...game.matchAll(/await init\(\{ module_or_path: Uint8Array\.from\(atob\("([^"]+)"\), c => c\.charCodeAt\(0\)\) \}\);/g)];
  assert.equal(save.length, 1); assert.equal(glue.length, 1); assert.equal(wasm.length, 1);
  return { watchSaveSha256: sha(Buffer.from(save[0][1], "base64")), glueSha256: sha(Buffer.from(glue[0][1], "base64")), wasmSha256: sha(Buffer.from(wasm[0][1], "base64")) };
}

test("success binds executed validation snapshots to actual packaged module/WASM bytes", async () => {
  const f = await fixture("unchanged");
  const result = run(f);
  assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  const actual = decodeBindings(await readFile(f.output, "utf8"));
  assert.deepEqual(receipt.validation, actual);
  assert.deepEqual(actual, {
    watchSaveSha256: sha(await readFile(join(f.root, "watch-save.js"))),
    glueSha256: sha(await readFile(join(f.root, "pkg/longwater_web.js"))),
    wasmSha256: sha(await readFile(join(f.root, "pkg/longwater_web_bg.wasm"))),
  });
  assert.equal(await readFile(f.input, "utf8"), watchRaw);
});

test("validation executes captured source bytes even when stale file-URL modules were preloaded", async () => {
  const f = await fixture("preloaded");
  const preload = join(f.root, "preload.mjs");
  const code = [
    'import { readFile, writeFile } from "node:fs/promises";',
    'import { pathToFileURL } from "node:url";',
    'const targets = ' + JSON.stringify([
      { path: join(f.root, "watch-save.js"), marker: "__capturedWatchModule" },
      { path: join(f.root, "pkg/longwater_web.js"), marker: "__capturedGlueModule" },
    ]) + ';',
    'for (const item of targets) {',
    '  await import(pathToFileURL(item.path));',
    '  const before = await readFile(item.path, "utf8");',
    '  await writeFile(item.path, before + "\\nglobalThis." + item.marker + " = true;\\n");',
    '}',
    'process.on("beforeExit", () => console.error("CAPTURED_MODULES=" + JSON.stringify([globalThis.__capturedWatchModule === true, globalThis.__capturedGlueModule === true])));',
  ].join("\n");
  await writeFile(preload, code);
  const result = run(f, ["--import", preload]);
  assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /CAPTURED_MODULES=\[true,true\]/);
  assert.deepEqual(JSON.parse(result.stdout).validation, decodeBindings(await readFile(f.output, "utf8")));
  assert.equal(await readFile(f.input, "utf8"), watchRaw);
});

test("packaged source divergence refuses even when the child restores the original paths before returning", async t => {
  for (const target of ["watch-save.js", "pkg/longwater_web.js", "pkg/longwater_web_bg.wasm"]) await t.test(target, async () => {
    const f = await fixture("restored");
    const path = join(f.root, target), before = await readFile(path);
    const packager = join(f.root, "scripts/package.mjs");
    const ordinary = join(f.root, "scripts/ordinary-package.mjs");
    await copyFile(packager, ordinary);
    const wrapper = [
      'import { readFile, writeFile } from "node:fs/promises";',
      'const target = ' + JSON.stringify(path) + ';',
      'const before = await readFile(target);',
      'const suffix = Buffer.from(' + JSON.stringify(target.endsWith(".wasm") ? [0] : Array.from(Buffer.from("\n// isolated child source-transition fixture\n"))) + ');',
      'await writeFile(target, Buffer.concat([before, suffix]));',
      'try { await import("./ordinary-package.mjs"); } finally { await writeFile(target, before); }',
    ].join("\n");
    await writeFile(packager, wrapper);
    const result = run(f);
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0, "divergent validation bytes must not be published");
    assert.equal(result.signal, null);
    assert.match(result.stderr, /validation|source|packaged/i);
    assert.equal(await exists(f.output), false);
    assert.deepEqual(await readFile(path), before, "a pathname-only after-check would see the original again");
    assert.equal(await readFile(f.input, "utf8"), watchRaw);
    assert.deepEqual(await readFile(ordinary), await readFile(join(project, "scripts/package.mjs")));
    assert.equal((await readdir(f.root)).some(name => name.startsWith(".longwater-watch-")), false);
  });
});
