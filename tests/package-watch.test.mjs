import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const project = resolve(process.env.LONGWATER_SOURCE_ROOT ?? fileURLToPath(new URL("..", import.meta.url)));
const work = await mkdtemp(resolve(tmpdir(), "longwater-package-watch-"));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const { default: init, BrowserSession } = await import(pathToFileURL(resolve(project, "pkg/longwater_web.js")));
const { SavedWatch } = await import(pathToFileURL(resolve(project, "watch-save.js")));
await init({ module_or_path: await readFile(resolve(project, "pkg/longwater_web_bg.wasm")) });
let saved = null;
const donor = new SavedWatch({ createSession: () => new BrowserSession(), getStorage: () => ({ getItem: () => saved, setItem(_key, value) { saved = value; } }) });
for (const selected of [0, 1, 2]) { donor.select(selected); donor.takeTurn("shade"); }
const canonical = donor.exportFile();
donor.free();
const exactWatch = JSON.stringify(JSON.parse(canonical), null, 2) + "\n";
const input = resolve(work, 'Watch " & <img src=x onerror="globalThis.__includedWatchInjected=1">.json');
await writeFile(input, exactWatch);
const nativeWasmHash = sha(await readFile(resolve(project, "pkg/longwater_web_bg.wasm")));
function run(args) {
  return spawnSync(process.execPath, [resolve(project, "scripts/package-watch.mjs"), ...args],
    { cwd: project, encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024 });
}
async function exists(path) { try { await stat(path); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; } }

test("explicit CLI produces a self-contained artifact and truthful selected-input/final-output provenance", async () => {
  const output = resolve(work, "selected-watch.html");
  const result = run([input, "--output", output]);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  const html = await readFile(output);
  assert.deepEqual(receipt.input, { file: input, bytes: Buffer.byteLength(exactWatch), sha256: sha(exactWatch) });
  assert.equal(receipt.file, output);
  assert.equal(receipt.bytes, html.length);
  assert.equal(receipt.sha256, sha(html));
  assert.deepEqual(receipt.watch, { day: 3, selected: "south" });
  assert.match(receipt.controllerSha256, /^[a-f0-9]{64}$/);
  assert.equal(receipt.controllerSha256, sha(await readFile(resolve(project, "included-watch.js"))));
  const original = resolve(work, "ordinary-offline.html");
  const packed = spawnSync(process.execPath, [resolve(project, "scripts/package.mjs"), original],
    { encoding: "utf8", timeout: 30000 });
  assert.equal(packed.status, 0, packed.stderr);
  const packing = JSON.parse(packed.stdout);
  assert.deepEqual(receipt.game, { bytes: packing.bytes, sha256: packing.sha256, sourceSha256: packing.sourceSha256 });
  const text = html.toString("utf8");
  const ordinary = await readFile(original, "utf8");
  const entry = ordinary.match(/<script[^>]+src="(data:text\/javascript;base64,[^"]+)"/)?.[1];
  assert.ok(entry, "the maintained packaged game entry exists");
  assert.ok(text.includes(entry), "the game entry remains byte exact");
  const game = Buffer.from(entry.split(",")[1], "base64").toString("utf8");
  const wasm = game.match(/Uint8Array\.from\(atob\("([A-Za-z0-9+/=]+)"\)/)?.[1];
  assert.equal(sha(Buffer.from(wasm, "base64")), nativeWasmHash);
  assert.ok(!/<(?:script|link)[^>]+(?:src|href)="(?:https?:|\.\/)/.test(text), "no external/local runtime assets");
  assert.equal(await readFile(input, "utf8"), exactWatch);
});

test("repeat generation is byte deterministic without overwriting either destination", async () => {
  const first = resolve(work, "deterministic-a.html"), second = resolve(work, "deterministic-b.html");
  const a = run([input, "--output", first]), b = run([input, "--output", second]);
  assert.equal(a.status, 0, a.stderr); assert.equal(b.status, 0, b.stderr);
  assert.deepEqual(await readFile(first), await readFile(second));
  assert.equal(JSON.parse(a.stdout).sha256, JSON.parse(b.stdout).sha256);
});

test("a pre-existing output is refused with its bytes, inode, mode and timestamps preserved", async () => {
  const output = resolve(work, "keep-existing.html");
  const sentinel = Buffer.from("Existing recipient artifact\n");
  await writeFile(output, sentinel, { mode: 0o640 });
  const before = await stat(output, { bigint: true });
  const result = run([input, "--output", output]);
  assert.notEqual(result.status, 0);
  assert.equal(result.signal, null);
  assert.deepEqual(await readFile(output), sentinel);
  const after = await stat(output, { bigint: true });
  for (const key of ["ino", "mode", "size", "mtimeNs", "ctimeNs"]) assert.equal(after[key], before[key], key);
  assert.equal(await readFile(input, "utf8"), exactWatch);
});

test("invalid or forged watch data refuses before publication and preserves inputs", async t => {
  const value = JSON.parse(canonical);
  const invalid = [
    ["malformed", "{"],
    ["wrong-revision", JSON.stringify({ ...value, simulation: "not-this-simulation" })],
    ["forged-snapshot", JSON.stringify({ ...value, snapshot: "{}" })],
    ["oversize", " ".repeat(32769)],
  ];
  for (const [name, raw] of invalid) await t.test(name, async () => {
    const source = resolve(work, name + ".json"), output = resolve(work, name + ".html");
    await writeFile(source, raw);
    const result = run([source, "--output", output]);
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.equal(result.signal, null);
    assert.equal(await exists(output), false);
    assert.equal(await readFile(source, "utf8"), raw);
  });
});

test("a missing output choice cannot silently create the ordinary download or modify the input", async () => {
  const before = await readFile(input);
  const result = run([input]);
  assert.notEqual(result.status, 0);
  assert.deepEqual(await readFile(input), before);
  assert.match(result.stderr, /output|usage/i);
});
