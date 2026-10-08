import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [sourceArg, manifestArg, outputArg, siteArg] = process.argv.slice(2);
assert(sourceArg && manifestArg && outputArg && siteArg,
  "Usage: node receive-public-practice.mjs SOURCE PINNED_MANIFEST NEW_OUTPUT_DIRECTORY SITE_URL");
const source = path.resolve(sourceArg), output = path.resolve(outputArg);
const manifestBytes = await readFile(manifestArg);
const manifest = JSON.parse(manifestBytes);
const rootUrl = new URL(siteArg);
assert.equal(rootUrl.href, "https://jacobmetoyer.com/longwater-browser-demo/",
  "Use the documented HTTPS directory, without query or fragment");
assert.match(manifest.sourceHead, /^[a-f0-9]{40}$/);
assert.match(manifest.sourceTree, /^[a-f0-9]{40}$/);
assert(Array.isArray(manifest.inputs) && manifest.inputs.length > 0);
assert.equal(manifest.artifact.path, "downloads/Longwater-Fourteen-Tides.html");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const gitBlob = bytes => createHash("sha1").update("blob " + bytes.length + "\0").update(bytes).digest("hex");
const files = [...manifest.inputs, manifest.artifact];
assert.equal(new Set(files.map(item => item.path)).size, files.length);
const expected = new Map();
for (const item of files) {
  assert(!path.isAbsolute(item.path) && !item.path.split(/[\\/]/).includes(".."));
  const bytes = await readFile(path.join(source, item.path));
  assert.equal(bytes.length, item.bytes, item.path + " local byte length");
  assert.equal(sha(bytes), item.sha256, item.path + " local SHA-256");
  assert.equal(gitBlob(bytes), item.git_blob, item.path + " published Git blob");
  expected.set(item.path, bytes);
}
const sourceHash = createHash("sha256");
for (const item of manifest.inputs) sourceHash.update(item.path).update("\0").update(expected.get(item.path)).update("\0");
assert.equal(sourceHash.digest("hex"), manifest.sourceSha256);
assert.equal(expected.get(manifest.artifact.path).toString("utf8").match(
  /name="longwater-source-sha256" content="([^"]+)"/)?.[1], manifest.sourceSha256);
await mkdir(output);
const proof = {
  schema: "longwater.public-practice-receiving.v1",
  state: "running", phase: "static-preflight", startedAt: new Date().toISOString(),
  site: rootUrl.href, sourceHead: manifest.sourceHead, sourceTree: manifest.sourceTree,
  sourceSha256: manifest.sourceSha256, manifestSha256: sha(manifestBytes),
  nativeSourceRoot: source, browserLaunched: false,
  scope: "One temporary practice tide in a fresh owned profile; no active-watch actions or file adoption",
  preflight: [], loadedInputs: [], pageErrors: [], consoleErrors: [], assetErrors: [],
};
const mimeMatches = (name, type) => {
  const mime = (type || "").split(";")[0].trim().toLowerCase();
  if (name.endsWith(".css")) return mime === "text/css";
  if (name.endsWith(".js")) return ["application/javascript", "text/javascript"].includes(mime);
  if (name.endsWith(".wasm")) return mime === "application/wasm";
  return mime === "text/html";
};
async function preflight(item) {
  const url = new URL(item.path, rootUrl).href;
  try {
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(15000) });
    const chunks = [], reader = response.body?.getReader();
    let size = 0;
    if (reader) for (;;) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > 1048576) { await reader.cancel(); throw Error("response exceeds 1 MiB bound"); }
      chunks.push(Buffer.from(result.value));
    }
    const bytes = Buffer.concat(chunks);
    return {
      path: item.path, url, status: response.status, bytes: bytes.length, sha256: sha(bytes),
      git_blob: gitBlob(bytes), contentType: response.headers.get("content-type"),
      exact: response.status === 200 && bytes.equals(expected.get(item.path)) &&
        mimeMatches(item.path, response.headers.get("content-type")),
    };
  } catch (error) {
    return { path: item.path, url, exact: false, error: String(error) };
  }
}
const assetName = urlString => {
  const url = new URL(urlString);
  if (url.origin !== rootUrl.origin || !url.pathname.startsWith(rootUrl.pathname)) return null;
  return decodeURIComponent(url.pathname.slice(rootUrl.pathname.length)) || "index.html";
};
const liveState = page => page.evaluate(() => ({
  summary: document.querySelector("#state-summary").textContent,
  readings: [0, 1, 2].map(i => document.querySelector("#cell-" + i + "-readings").textContent),
  selected: [...document.querySelectorAll(".game-control[data-cell]")].map(el => el.getAttribute("aria-pressed")),
  journal: document.querySelector("#watch-journal").textContent,
  notes: document.querySelector("#report-lines").textContent,
  event: document.querySelector("#event-notes").textContent,
  announcement: document.querySelector("#live").textContent,
  saved: Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])),
}));
async function practiceReadings(page, before, after) {
  const columns = (label, prior, value) => before ? [label, String(prior), String(value)] : [label, String(value)];
  const rows = table => table.locator("tbody tr").evaluateAll(items =>
    items.map(row => [...row.children].map(cell => cell.textContent)));
  const resources = await rows(page.getByRole("table", { name: "Practice resources", exact: true }));
  assert.deepEqual(resources, [
    columns("Water", before?.freshwater, after.freshwater),
    columns("Seed packs", before?.seedPacks, after.seedPacks),
  ]);
  const readings = [
    ["depth", "Depth (cm)"], ["salinity", "Salt (ppt)"], ["oxygen", "Oxygen (%)"],
    ["biomass", "Life (%)"], ["shade", "Canopy (of 3)"],
  ];
  const cells = [];
  for (const [index, cell] of after.cells.entries()) {
    const actual = await rows(page.getByRole("table", { name: cell.name, exact: true }));
    assert.deepEqual(actual, readings.map(([key, label]) => columns(label, before?.cells[index][key], cell[key])));
    cells.push({ name: cell.name, readings: actual });
  }
  const summary = await page.locator("#practice-summary").textContent();
  assert.match(summary, new RegExp("Practice tide " + after.day + " / 14"));
  let notes = null;
  if (after.report) {
    const region = page.getByRole("region", { name: "Complete practice field notes", exact: true });
    notes = {
      event: await region.locator("h3").textContent(),
      explanation: await region.locator("p").textContent(),
      lines: await region.locator("li").allTextContents(),
    };
    assert.deepEqual(notes.lines, after.report.lines);
    assert.equal(notes.event, after.report.event.name);
    assert.equal(notes.explanation, after.report.event.note);
    assert.match(await page.locator("#practice-output").textContent(),
      /action, the tide event, and dawn drift in all three cells/);
  } else {
    assert.equal(await page.getByRole("region", { name: "Complete practice field notes", exact: true }).count(), 0);
  }
  return { summary, resources, cells, notes };
}
let context;
try {
  for (let n = 0; n < files.length; n += 3) {
    proof.preflight.push(...await Promise.all(files.slice(n, n + 3).map(preflight)));
  }
  assert(proof.preflight.every(item => item.exact), "Live assets must all match the pinned native source before launching a browser");
  proof.phase = "browser-receiving";
  const require = createRequire(path.join(source, "package.json"));
  const { chromium } = require("playwright");
  proof.playwright = require("playwright/package.json").version;
  const { BrowserSession, initSync } = await import(pathToFileURL(path.join(source, "pkg/longwater_web.js")).href);
  initSync({ module: expected.get("pkg/longwater_web_bg.wasm") });
  const oracle = new BrowserSession();
  let opening, afterGate;
  try {
    opening = JSON.parse(oracle.snapshot_json());
    afterGate = JSON.parse(oracle.take_turn("gate", "north"));
  } finally { oracle.free(); }
  assert.equal(opening.day, 0); assert.equal(afterGate.day, 1);
  proof.oracle = { action: "gate", cell: "north", opening, afterGate };
  const profile = path.join(output, "browser-profile");
  await mkdir(profile);
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    executablePath: process.env.LONGWATER_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    viewport: { width: 1280, height: 900 },
  });
  proof.browserLaunched = true; proof.freshProfile = profile;
  const page = context.pages()[0] || await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", error => proof.pageErrors.push(error.message));
  page.on("console", item => { if (item.type() === "error") proof.consoleErrors.push(item.text()); });
  const tasks = [], received = new Map(), runtimeNames = new Set(manifest.inputs.map(item => item.path));
  page.on("response", response => {
    const name = assetName(response.url());
    if (!runtimeNames.has(name)) return;
    tasks.push((async () => {
      const bytes = await response.body();
      assert.equal(response.status(), 200, name + " browser response");
      assert(bytes.equals(expected.get(name)), name + " exact loaded source");
      assert(mimeMatches(name, response.headers()["content-type"]), name + " browser MIME");
      received.set(name, { path: name, bytes: bytes.length, sha256: sha(bytes), git_blob: gitBlob(bytes), url: response.url() });
    })().catch(error => proof.assetErrors.push(String(error))));
  });
  await page.goto(rootUrl.href, { waitUntil: "load" });
  await page.waitForFunction(() => {
    const trigger = document.querySelector("#practice-open");
    return trigger && !trigger.disabled && /Day 0 of 14/.test(document.querySelector("#state-summary")?.textContent);
  });
  await Promise.all(tasks);
  assert.deepEqual(proof.assetErrors, []);
  assert.deepEqual([...received.keys()].sort(), [...runtimeNames].sort(), "Every pinned runtime input was actually loaded");
  proof.loadedInputs = [...received.values()];
  proof.userAgent = await page.evaluate(() => navigator.userAgent);
  const before = await liveState(page);
  assert(Object.keys(before.saved).length === 0, "Fresh receiving profile has no saved watch");
  proof.activeWatchBefore = before;
  await page.getByRole("button", { name: "Open practice", exact: true }).click();
  assert.equal(await page.getByRole("dialog", { name: "Learn the tides", exact: true }).isVisible(), true);
  assert.equal(await page.locator('[data-practice-cell="1"]').getAttribute("aria-pressed"), "true");
  proof.practiceOpening = await practiceReadings(page, null, opening);
  await page.locator('[data-practice-cell="0"]').click();
  await page.locator('[data-practice-action="gate"]').click();
  proof.practiceAfterGate = await practiceReadings(page, opening, afterGate);
  assert.deepEqual(await liveState(page), before, "Practice preserves the active watch, journal and storage");
  await page.locator("#practice-summary").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, "public-practice-tide-one.png") });
  await page.getByRole("button", { name: "Close practice", exact: true }).click();
  assert.equal(await page.locator("#practice-watch").evaluate(el => el.open), false);
  assert.equal(await page.locator("#practice-open").evaluate(el => el === document.activeElement), true);
  assert.deepEqual(await liveState(page), before);
  await page.getByRole("button", { name: "Open practice", exact: true }).click();
  proof.practiceReopened = await practiceReadings(page, null, opening);
  assert.equal(await page.locator('[data-practice-cell="1"]').getAttribute("aria-pressed"), "true");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#practice-watch").evaluate(el => el.open), false);
  assert.equal(await page.locator("#practice-open").evaluate(el => el === document.activeElement), true);
  proof.activeWatchAfter = await liveState(page);
  assert.deepEqual(proof.activeWatchAfter, before);
  await page.screenshot({ path: path.join(output, "public-active-watch-unchanged.png") });
  await Promise.all(tasks);
  assert.deepEqual(proof.assetErrors, []);
  assert.deepEqual(proof.pageErrors, []);
  assert.deepEqual(proof.consoleErrors, []);
  for (const item of files) assert((await readFile(path.join(source, item.path))).equals(expected.get(item.path)),
    item.path + " native input remained unchanged");
  proof.phase = "complete"; proof.state = "passed";
  proof.activeWatchUnchanged = true; proof.practiceTidesAccepted = 1; proof.reopenedAtTideZero = true;
} catch (error) {
  proof.state = "failed"; proof.error = String(error); proof.stack = error.stack;
  process.exitCode = 1;
} finally {
  try { await context?.close(); } catch (error) {
    proof.state = "failed"; proof.closeError = String(error); process.exitCode = 1;
  }
  proof.finishedAt = new Date().toISOString();
  const text = JSON.stringify(proof, null, 2) + "\n";
  const receiptPath = path.join(output, "receiving.json");
  await writeFile(receiptPath, text, { flag: "wx" });
  console.log(JSON.stringify({
    state: proof.state, phase: proof.phase, browserLaunched: proof.browserLaunched,
    sourceHead: proof.sourceHead, sourceTree: proof.sourceTree,
    receiptPath, receiptSha256: sha(text), error: proof.error, closeError: proof.closeError,
  }));
}
