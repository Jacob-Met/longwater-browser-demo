import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDirectory = resolve(root, "docs/receiving/watch-file-transfer-965d2e86e979/integration-seams/pr19");
const witnessPath = join(fixtureDirectory, "receive-adoption-seam.mjs.source");
const inputPath = join(fixtureDirectory, "incoming-pr19.json");
const manifestPath = resolve(root, "scripts/watch-choice-adoption-runtime.json");
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const gitBlob = bytes => createHash("sha1").update(Buffer.from("blob " + bytes.length + "\0")).update(bytes).digest("hex");
const git = args => execFileSync("git", ["--no-optional-locks", "-C", root, ...args]);
const frozenWitness = await readFile(witnessPath);
const frozenInput = await readFile(inputPath);
const manifestBytes = await readFile(manifestPath);
const adapterBefore = await readFile(fileURLToPath(import.meta.url));
assert.equal(digest(frozenWitness), "c57da7094d50fd78af2ef52024fa61dd90b31ca2aa226a59121ea50151d616ae", "the original receiving witness must stay exact");
assert.equal(digest(frozenInput), "558d8dd83756a036da0c4fc5392ad58b0617d38625a719cb856bc1abf593b451", "the original incoming-source custody fixture must stay exact");
const manifest = JSON.parse(manifestBytes);
assert.equal(manifest.version, 1);
assert.ok(Array.isArray(manifest.runtime) && manifest.runtime.length > 0);
assert.equal(new Set(manifest.runtime.map(entry => entry.path)).size, manifest.runtime.length, "runtime paths are unique");
const commit = git(["rev-parse", "HEAD"]).toString().trim();
const tree = git(["rev-parse", "HEAD^{tree}"]).toString().trim();
for (const entry of manifest.runtime) {
  const bytes = git(["show", commit + ":" + entry.path]);
  assert.equal(bytes.length, entry.bytes, entry.path + " byte length");
  assert.equal(gitBlob(bytes), entry.gitBlob, entry.path + " published Git blob");
  assert.equal(digest(bytes), entry.sha256, entry.path + " source SHA256");
}

const witnessText = frozenWitness.toString("utf8");
const serverMarker = "const mime = path =>";
const caseMarker = "const result = {\n";
assert.equal(witnessText.split(serverMarker).length, 2);
assert.equal(witnessText.split(caseMarker).length, 2);
const caseBlock = witnessText.slice(witnessText.indexOf(caseMarker));
assert.equal(digest(Buffer.from(caseBlock)), "21b3d34694853ec0072e9c051bd62e3a1ee1b5591b6bee62c5371c8076d55994", "all original runtime cases, observations, assertions and cleanup stay exact");

function once(text, needle, replacement) {
  assert.equal(text.split(needle).length, 2, "one environment substitution: " + needle);
  return text.replace(needle, () => replacement);
}

let runtime = witnessText.slice(witnessText.indexOf(serverMarker));
runtime = once(runtime,
  'await import(pathToFileURL("/Users/me/hamon-work-longwater-delivery-c945953fdeb7/node_modules/playwright/index.mjs"))',
  'await import(pathToFileURL(join(source, "node_modules/playwright/index.mjs")))');
runtime = once(runtime,
  'executablePath: "/Users/me/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",',
  "executablePath: chromium.executablePath(),");
assert.equal(runtime.slice(runtime.indexOf(caseMarker)), caseBlock);

const output = await mkdtemp(join(tmpdir(), "longwater-choice-adoption-"));
const adaptedPath = join(output, "receive-adoption-seam.mjs");
const bootstrap = [
  'import assert from "node:assert/strict";',
  'import { createHash } from "node:crypto";',
  'import { execFileSync } from "node:child_process";',
  'import { createServer } from "node:http";',
  'import { readFile, writeFile } from "node:fs/promises";',
  'import { pathToFileURL, fileURLToPath } from "node:url";',
  'import { join } from "node:path";',
  "",
  "const here = " + JSON.stringify(output) + ";",
  "const source = " + JSON.stringify(root) + ";",
  "const commit = " + JSON.stringify(commit) + ";",
  "const inputPath = " + JSON.stringify(inputPath) + ";",
  "const inputBytes = await readFile(inputPath);",
  "const harnessBefore = await readFile(fileURLToPath(import.meta.url));",
  "const sha = b => createHash(\"sha256\").update(b).digest(\"hex\");",
  "const blob = b => createHash(\"sha1\").update(Buffer.from(\"blob \" + b.length + \"\\0\")).update(b).digest(\"hex\");",
  "const git = args => execFileSync(\"git\", [\"--no-optional-locks\", \"-C\", source, ...args]);",
  "const raw = (ref, path) => git([\"show\", ref + \":\" + path]);",
  "const manifest = " + JSON.stringify(manifest) + ";",
  "const originals = new Map(manifest.runtime.map(entry => [entry.path, raw(commit, entry.path)]));",
  "for (const entry of manifest.runtime) {",
  "  const bytes = originals.get(entry.path);",
  "  assert.equal(bytes.length, entry.bytes);",
  "  assert.equal(blob(bytes), entry.gitBlob);",
  "  assert.equal(sha(bytes), entry.sha256);",
  "}",
  "const served = new Map(originals);",
  "const sourceReceipt = {",
  '  basis: "Actual frozen joint Git source served directly; no production rewrite or owner ref mutation.",',
  "  commit, tree: " + JSON.stringify(tree) + ",",
  '  original_witness_sha256: "c57da7094d50fd78af2ef52024fa61dd90b31ca2aa226a59121ea50151d616ae",',
  '  original_runtime_case_block_sha256: "21b3d34694853ec0072e9c051bd62e3a1ee1b5591b6bee62c5371c8076d55994",',
  "  manifest_sha256: " + JSON.stringify(digest(manifestBytes)) + ",",
  "  adapter_sha256: " + JSON.stringify(digest(adapterBefore)) + ",",
  "  original_runtime: [...originals].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: sha(bytes), git_blob: blob(bytes) })),",
  "  served_runtime: [...served].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: sha(bytes), git_blob: blob(bytes) })),",
  "  harness_sha256: sha(harnessBefore), incoming_file_sha256: sha(inputBytes),",
  "};",
  'await writeFile(join(here, "source-custody.json"), JSON.stringify(sourceReceipt, null, 2) + "\\n");',
  "",
].join("\n");
const adapted = bootstrap + runtime;
assert.equal(adapted.slice(adapted.indexOf(caseMarker)), caseBlock);

let execution;
try {
  await writeFile(adaptedPath, adapted);
  execution = spawnSync(process.execPath, [adaptedPath], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    timeout: 90_000,
  });
  // Only these original authored outputs are emitted, including a causal failure.
  const outputNames = ["source-custody.json", "run.json", "run.log", "failed-display-actual-download.json"];
  let totalBytes = 0;
  for (const name of outputNames) {
    let bytes;
    try {
      bytes = await readFile(join(output, name));
    } catch (error) {
      if (error.code === "ENOENT") {
        console.log("LONGWATER_ADOPTION_RECEIVING_MISSING " + JSON.stringify({ path: name }));
        continue;
      }
      throw error;
    }
    totalBytes += bytes.length;
    assert.ok(bytes.length <= 131_072 && totalBytes <= 262_144, "bounded authored receiving output");
    const text = bytes.toString("utf8");
    assert.ok(Buffer.from(text).equals(bytes), "receiving output is exact UTF-8");
    console.log("LONGWATER_ADOPTION_RECEIVING_FILE " + JSON.stringify({ path: name, bytes: bytes.length, sha256: digest(bytes), text }));
  }
  if (execution.error) throw execution.error;
  assert.equal(execution.signal, null, "the receiving child must finish normally");
  const result = JSON.parse(await readFile(join(output, "run.json"), "utf8"));
  assert.deepEqual(result.cases.map(entry => entry.name), [
    "preview_cancel_keeps_comparison",
    "successful_adoption_clears_comparison",
    "failed_display_adoption_clears_comparison",
  ]);
  assert.equal(result.passed + result.failed, 3);
  assert.equal(result.inputs_unchanged, true);
  assert.equal(digest(await readFile(witnessPath)), digest(frozenWitness));
  assert.equal(digest(await readFile(inputPath)), digest(frozenInput));
  assert.equal(digest(await readFile(manifestPath)), digest(manifestBytes));
  assert.equal(digest(await readFile(fileURLToPath(import.meta.url))), digest(adapterBefore));
  console.log("LONGWATER_ADOPTION_RECEIVING_RESULT " + JSON.stringify({
    commit, tree, passed: result.passed, failed: result.failed,
    original_runtime_case_block_sha256: digest(Buffer.from(caseBlock)),
    actual_adapted_harness_sha256: digest(Buffer.from(adapted)),
    unchanged_inputs: true, exit_status: execution.status,
  }));
  assert.equal(execution.status, result.failed ? 1 : 0);
  process.exitCode = execution.status;
} finally {
  await rm(output, { recursive: true, force: true });
}
