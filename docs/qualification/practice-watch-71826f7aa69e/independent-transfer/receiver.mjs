import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { chromium } from "/Users/me/workspace/estate/production-evidence-49f845d0dece/browser-tools/node_modules/playwright/index.mjs";

const sourceRoot = process.argv[2];
const pinPath = process.argv[3];
assert.ok(sourceRoot && pinPath, "Pass the independently reviewed composed source root and source-pin JSON");
const output = "/Users/me/hamon-longwater-practice-review-71826f7aa69e/transfer-composition";
const pins = JSON.parse(await readFile(pinPath, "utf8"));
assert.equal(pins.target, "43038d28b08562a5f1c143b2773d925b4d28ca7d");
const sha = value => createHash("sha256").update(value).digest("hex");
const blob = bytes => createHash("sha1").update("blob " + bytes.length + "\0").update(bytes).digest("hex");
async function verifySource() {
  const result = [];
  for (const pin of pins.files) {
    const bytes = await readFile(sourceRoot + "/" + pin.path);
    assert.equal(blob(bytes), pin.git_blob, "exact reviewed composition source: " + pin.path);
    if (pin.bytes !== undefined) assert.equal(bytes.length, pin.bytes);
    if (pin.sha256) assert.equal(sha(bytes), pin.sha256);
    result.push({ path: pin.path, bytes: bytes.length, sha256: sha(bytes), git_blob: blob(bytes) });
  }
  return result;
}
const receipt = {
  schema: "longwater-practice-transfer-independent/1",
  reviewer: "estate-71826f7aa69e/coordination",
  target: pins.target,
  target_tree: "aaffb920e4a3a0065756c234cdeb0a8a1631f1a2",
  criterion: "criterion.json",
  case_count: 1,
  started_at: new Date().toISOString(),
  boundary: "The actual composed page, shipped WASM, native file chooser and a valid authored watch file are used in a fresh isolated profile. A wrapper holds only completion of the real File.text bytes. No product source or native return value is replaced. Old independent/author cases are not repeated.",
  checks: [],
};
let browser, context, server, control;
const pageErrors = [];
async function watchView(page) {
  return page.evaluate(() => ({
    summary: document.querySelector("#state-summary").textContent,
    selected: [...document.querySelectorAll("#playfield [data-cell]")].map(el => el.getAttribute("aria-pressed")),
    readings: [0, 1, 2].map(i => document.querySelector("#cell-" + i + "-readings").textContent),
    event: document.querySelector("#event-notes").textContent,
    report: [...document.querySelectorAll("#report-lines li")].map(el => el.textContent),
    journal: document.querySelector("#watch-journal").innerHTML,
    save_status: document.querySelector("#watch-save-status").textContent,
    storage: Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])),
  }));
}
async function practiceView(page) {
  return page.evaluate(() => ({
    summary: document.querySelector("#practice-summary").textContent,
    status: document.querySelector("#practice-status").textContent,
    selected: [...document.querySelectorAll("[data-practice-cell]")].map(el => el.getAttribute("aria-pressed")),
    output: document.querySelector("#practice-output").innerHTML,
  }));
}
const saved = page => page.evaluate(() => localStorage.getItem("longwater.watch.v1"));
await mkdir(output, { recursive: true });
try {
  receipt.source_before = await verifySource();
  const { serve } = await import(pathToFileURL(sourceRoot + "/tests/server.mjs").href);
  const { initSync, BrowserSession } = await import(pathToFileURL(sourceRoot + "/pkg/longwater_web.js").href);
  const wasm = await readFile(sourceRoot + "/pkg/longwater_web_bg.wasm");
  assert.equal(sha(wasm), "76deec059601613d588f4685444d407da81b3339f7cf7bdaf1bd1a13b285dae2");
  initSync({ module: wasm });
  control = new BrowserSession();
  const importedTurns = [
    { action: "shade", cell: "north" },
    { action: "gate", cell: "south" },
    { action: "seed", cell: "heart" },
  ];
  for (const action of importedTurns) control.take_turn(action.action, action.cell);
  const importedSnapshot = control.snapshot_json();
  const incoming = JSON.stringify({
    version: 1,
    simulation: "76deec059601613d588f4685444d407da81b3339f7cf7bdaf1bd1a13b285dae2",
    turns: importedTurns,
    selected: "north",
    snapshot: importedSnapshot,
  });
  await writeFile(output + "/authored-incoming-watch.json", incoming);
  receipt.input = { path: "authored-incoming-watch.json", bytes: Buffer.byteLength(incoming), sha256: sha(incoming), turns: importedTurns, selected: "north", native_snapshot_sha256: sha(importedSnapshot) };

  server = await serve();
  browser = await chromium.launch({ headless: true, executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(() => {
    window.__reviewStorageWrites = [];
    const originalSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      window.__reviewStorageWrites.push(String(key));
      return Reflect.apply(originalSet, this, [key, value]);
    };
    const originalText = File.prototype.text;
    window.__heldWatchRead = null;
    File.prototype.text = function() {
      if (this.name !== "Independent_B_3_tides.json") return originalText.call(this);
      return new Promise((resolve, reject) => {
        originalText.call(this).then(raw => {
          window.__heldWatchRead = { name: this.name, size: this.size, raw, release: () => resolve(raw) };
        }, reject);
      });
    };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(server.url + "/");
  await page.waitForFunction(() => !document.querySelector("#practice-open").disabled && !document.querySelector("#watch-file-open").disabled);
  assert.equal(await page.locator("#startup-error").isVisible(), false);
  receipt.runtime = { node: process.version, chrome: browser.version(), headless: true, url: server.url, wasm_bytes: wasm.length };

  await page.locator('#playfield [data-action="gate"]').click();
  const original = await watchView(page);
  const originalRaw = await saved(page);
  assert.equal(JSON.parse(originalRaw).turns.length, 1);
  const writesBefore = await page.evaluate(() => window.__reviewStorageWrites.length);

  const chooser = page.waitForEvent("filechooser");
  await page.locator("#watch-file-open").click();
  await (await chooser).setFiles({ name: "Independent_B_3_tides.json", mimeType: "application/json", buffer: Buffer.from(incoming) });
  await page.waitForFunction(() => window.__heldWatchRead !== null);
  assert.match(await page.locator("#watch-file-status").textContent(), /Checking this watch file/);
  assert.equal(await page.locator("#watch-file-preview").evaluate(el => el.hidden), true);
  assert.deepEqual(await watchView(page), original);

  await page.locator("#practice-open").click();
  assert.match(await page.locator("#practice-summary").textContent(), /Practice tide 0 \/ 14/);
  await page.locator('[data-practice-cell="2"]').click();
  await page.locator('[data-practice-action="shade"]').click();
  assert.match(await page.locator("#practice-summary").textContent(), /Practice tide 1 \/ 14/);
  const practiceAccepted = await practiceView(page);
  const focusBefore = await page.evaluate(() => ({
    tag: document.activeElement.tagName,
    action: document.activeElement.dataset.practiceAction,
    inside_practice: !!document.activeElement.closest("#practice-watch"),
  }));
  assert.equal(focusBefore.inside_practice, true);
  const chosenRaw = await page.evaluate(() => window.__heldWatchRead.raw);
  assert.equal(chosenRaw, incoming, "the held value is the actual selected File.text result");
  await page.evaluate(() => window.__heldWatchRead.release());
  await page.waitForFunction(() => !document.querySelector("#watch-file-preview").hidden);
  assert.match(await page.locator("#watch-file-summary").textContent(), /Day 3 of 14.*North Bank/);
  assert.match(await page.locator("#watch-file-status").textContent(), /File checked/);
  const focusAfter = await page.evaluate(() => ({
    tag: document.activeElement.tagName,
    action: document.activeElement.dataset.practiceAction,
    inside_practice: !!document.activeElement.closest("#practice-watch"),
    transfer_panel_focused: document.activeElement.id === "watch-file-preview",
  }));
  assert.equal(focusAfter.inside_practice, true, "late nonmodal preview cannot escape the native practice modal");
  assert.equal(focusAfter.transfer_panel_focused, false);
  assert.deepEqual(await practiceView(page), practiceAccepted, "native preview replay leaves accepted practice unchanged");
  assert.deepEqual(await watchView(page), original, "neither preview nor practice replaces the active watch");
  assert.equal(await page.evaluate(() => window.__reviewStorageWrites.length), writesBefore);
  receipt.checks.push({
    name: "late real file preview remains separate from active practice and live watch",
    passed: true,
    focus_before: focusBefore,
    focus_after: focusAfter,
    held_file_bytes_exact: true,
    active_save_sha256: sha(originalRaw),
    accepted_practice_view_sha256: sha(JSON.stringify(practiceAccepted)),
    storage_writes_before_confirmation: 0,
  });

  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#practice-watch").evaluate(el => el.open), false);
  assert.equal(await page.locator("#practice-open").evaluate(el => el === document.activeElement), true);
  assert.equal(await page.locator("#watch-file-preview").evaluate(el => el.hidden), false, "practice Escape does not cancel an unrelated valid file preview");
  assert.deepEqual(await watchView(page), original);
  await page.locator("#watch-file-confirm").click();
  await page.waitForFunction(() => document.querySelector("#watch-file-preview").hidden);
  assert.equal(await saved(page), incoming, "single explicit replacement adopts the exact file");
  assert.equal(await page.locator("#journal-entries > li").count(), 3);
  assert.equal(await page.locator('#playfield [data-cell="0"]').getAttribute("aria-pressed"), "true");
  assert.match(await page.locator("#watch-file-status").textContent(), /Opened day 3.*saved in this browser/);
  assert.equal(await page.evaluate(() => window.__reviewStorageWrites.length), writesBefore + 1, "one confirmation makes one accepted save write");
  const importedView = await watchView(page);
  await page.locator("#practice-open").click();
  assert.match(await page.locator("#practice-summary").textContent(), /Practice tide 0 \/ 14/, "practice remains a fresh watch after native file adoption");
  await page.locator("[data-practice-close]").click();
  assert.deepEqual(await watchView(page), importedView);
  assert.equal(await page.evaluate(() => window.__reviewStorageWrites.length), writesBefore + 1);
  receipt.checks.push({
    name: "practice close preserves pending consent and file adoption preserves later fresh practice",
    passed: true,
    explicit_confirmations: 1,
    accepted_save_writes: 1,
    imported_save_sha256: sha(incoming),
    imported_tides: 3,
    imported_selected_cell: "north",
    later_practice_opening_day: 0,
  });

  const expectedNext = control.take_turn("gate", "north");
  await page.locator('#playfield [data-action="gate"]').press("Enter");
  const actual = JSON.parse(await saved(page));
  assert.equal(actual.snapshot, expectedNext, "entire imported next native result equals the import-only control");
  assert.deepEqual(actual.turns, [...importedTurns, { action: "gate", cell: "north" }]);
  assert.equal(actual.selected, "north");
  assert.equal(await page.locator("#journal-entries > li").count(), 4);
  assert.deepEqual(await page.locator("#report-lines li").allTextContents(), JSON.parse(expectedNext).report.lines);
  assert.deepEqual(pageErrors, []);
  receipt.checks.push({
    name: "future imported live result survives preview and practice session creation/free",
    passed: true,
    control_actions: actual.turns,
    full_native_snapshot_bytes: Buffer.byteLength(expectedNext),
    expected_sha256: sha(expectedNext),
    actual_sha256: sha(actual.snapshot),
    full_native_snapshot_string_equal: true,
    journal_entries: 4,
    complete_report_lines_equal: true,
  });
  receipt.source_after = await verifySource();
  receipt.source_unchanged = JSON.stringify(receipt.source_before) === JSON.stringify(receipt.source_after);
  receipt.status = "passed";
} catch (error) {
  receipt.status = "failed";
  receipt.error = String(error);
  receipt.stack = error.stack;
} finally {
  control?.free();
  await context?.close();
  await browser?.close();
  await server?.close();
  receipt.page_errors = pageErrors;
  receipt.completed_at = new Date().toISOString();
  await writeFile(output + "/receiving.json", JSON.stringify(receipt, null, 2) + "\n");
  console.log(JSON.stringify(receipt));
  process.exitCode = receipt.status === "passed" ? 0 : 1;
}
