import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { initSync, BrowserSession } from "../pkg/longwater_web.js";
import { SavedWatch } from "../watch-save.js";
import { serve } from "./server.mjs";
const { chromium } = await import(process.env.LONGWATER_PLAYWRIGHT_MODULE || "playwright");

initSync({ module: await readFile(new URL("../pkg/longwater_web_bg.wasm", import.meta.url)) });
const captureDirectory = new URL("../test-results/watch-shelf/", import.meta.url);
const observations = [];
let browser, server;
const key = "longwater.shelf.v1";

before(async () => {
  await mkdir(captureDirectory, { recursive: true });
  server = await serve();
  browser = await chromium.launch({
    headless: true, executablePath: process.env.LONGWATER_CHROME_PATH || undefined, timeout: 45_000,
  });
});
after(async () => {
  await writeFile(new URL("observations.json", captureDirectory), JSON.stringify(observations, null, 2) + "\n");
  await browser?.close();
  await server?.close();
});

function file(name, turns = [["shade", "heart"], ["gate", "north"], ["seed", "south"]], selected = 2) {
  const memory = { raw: null, getItem() { return this.raw; }, setItem(_key, raw) { this.raw = raw; } };
  const watch = new SavedWatch({ createSession: () => new BrowserSession(), getStorage: () => memory });
  const native = new BrowserSession();
  try {
    for (const [action, cell] of turns) {
      watch.select(["north", "heart", "south"].indexOf(cell));
      assert.equal(watch.takeTurn(action), native.take_turn(action, cell));
    }
    watch.select(selected);
    return { name, mimeType: "application/json", buffer: Buffer.from(watch.exportFile()) };
  } finally { watch.free(); native.free(); }
}
async function open(t, options = {}, setup = null, url = null) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 900 }, ...options });
  t.after(() => context.close());
  if (setup) await context.addInitScript(setup);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], "no uncaught browser errors"));
  await page.goto(url || server.url);
  await page.locator("#shelf-open").waitFor({ state: "visible" });
  await page.waitForFunction(() => !document.querySelector("#shelf-open").disabled);
  return { page, context };
}
const shelf = page => page.locator("#watch-shelf");
const row = (page, id) => page.locator('[data-shelf-id="' + id + '"]');
async function openShelf(page) {
  await page.locator("#shelf-open").click();
  assert.equal(await shelf(page).evaluate(element => element.open), true);
}
async function keep(page, name) {
  await page.locator("#shelf-name").fill(name);
  await page.locator("#shelf-keep").click();
}
async function closeShelf(page) { await page.locator("#shelf-close").click(); }
async function savedShelf(page) { return page.evaluate(() => JSON.parse(localStorage.getItem("longwater.shelf.v1"))); }
async function primary(page) { return page.evaluate(() => localStorage.getItem("longwater.watch.v1")); }
async function probe(page) {
  return page.evaluate(() => ({
    saved: localStorage.getItem("longwater.watch.v1"),
    summary: document.querySelector("#state-summary").textContent,
    selected: [...document.querySelectorAll("[data-cell]")].map(element => element.getAttribute("aria-pressed")),
    journal: document.querySelector("#watch-journal").innerHTML,
    comparison: document.querySelector("#watch-choice").innerHTML,
  }));
}
async function chooseFile(page, fixture) {
  await page.locator("#watch-file-input").setInputFiles(fixture);
  await page.locator("#watch-file-preview").waitFor({ state: "visible" });
}
async function adoptFile(page, fixture) {
  await chooseFile(page, fixture);
  await page.locator("#watch-file-confirm").click();
}
async function download(page, name) {
  const pending = page.waitForEvent("download");
  await page.locator("#watch-file-download").click();
  const actual = await pending;
  const bytes = await readFile(await actual.path());
  await writeFile(new URL(name, captureDirectory), bytes);
  observations.push({ file: name, suggestedFilename: actual.suggestedFilename(), bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
  return bytes;
}

test("keep two exact native watches, rename one identity, reload, and adopt only the selected entry", async t => {
  const { page } = await open(t);
  const first = file("first.json");
  const second = file("second.json", [["gate", "south"], ["shade", "north"]], 1);
  await adoptFile(page, first);
  const original = await probe(page);
  await openShelf(page);
  await keep(page, "Three tide watch");
  assert.deepEqual(await probe(page), original, "keeping does not change any active history or auto-save");
  await closeShelf(page);
  await adoptFile(page, second);
  await openShelf(page);
  await keep(page, "Another watch");
  const stored = await savedShelf(page);
  assert.equal(stored.entries.length, 2);
  const [a, b] = stored.entries;
  assert.equal(a.watch, first.buffer.toString());
  assert.equal(b.watch, second.buffer.toString());
  await row(page, b.id).getByRole("button", { name: "Rename", exact: true }).click();
  await page.locator("#shelf-rename-name").fill("North bank attempt");
  await page.locator("#shelf-rename").getByRole("button", { name: "Save name", exact: true }).click();
  assert.deepEqual((await savedShelf(page)).entries, [a, { ...b, name: "North bank attempt" }]);
  await page.screenshot({ path: new URL("shelf-desktop.png", captureDirectory).pathname, fullPage: true });
  await closeShelf(page);
  await page.reload();
  await page.waitForFunction(() => !document.querySelector("#shelf-open").disabled);
  assert.equal(await primary(page), second.buffer.toString());
  await openShelf(page);
  const before = await probe(page);
  await row(page, a.id).getByRole("button", { name: "Open watch", exact: true }).click();
  await page.locator("#watch-file-preview").waitFor({ state: "visible" });
  assert.match(await page.locator("#watch-file-summary").textContent(), /Day 3.*South Reach/);
  assert.deepEqual(await probe(page), before, "review alone does not adopt the selected file");
  await page.locator("#watch-file-cancel").click();
  assert.deepEqual(await probe(page), before);
  await openShelf(page);
  await row(page, a.id).getByRole("button", { name: "Open watch", exact: true }).click();
  await page.locator("#watch-file-preview").waitFor({ state: "visible" });
  await page.locator("#watch-file-confirm").click();
  assert.equal(await primary(page), first.buffer.toString());
  assert.equal(await page.locator("#journal-entries > li").count(), 3);
  assert.equal(await page.locator('[data-cell="2"]').getAttribute("aria-pressed"), "true");
  assert.deepEqual(await download(page, "restored-three-tides.json"), first.buffer);
  assert.deepEqual((await savedShelf(page)).entries, [a, { ...b, name: "North bank attempt" }]);
});

test("opening, keeping, rename/remove cancellation and Escape preserve an existing manual-file review", async t => {
  const { page } = await open(t);
  await page.locator('[data-action="shade"]').click();
  const candidate = file("pending-native.json");
  await chooseFile(page, candidate);
  const before = await probe(page);
  const title = await page.locator("#watch-file-preview-title").textContent();
  await openShelf(page);
  await keep(page, "Current one tide");
  const stored = await savedShelf(page);
  const id = stored.entries[0].id;
  await row(page, id).getByRole("button", { name: "Rename", exact: true }).click();
  await page.locator("#shelf-rename-name").fill("Uncommitted name");
  await page.locator("#shelf-rename-cancel").click();
  await row(page, id).getByRole("button", { name: "Remove from shelf", exact: true }).click();
  assert.equal(await page.locator("#shelf-remove-cancel").evaluate(element => element === document.activeElement), true);
  await page.locator("#shelf-remove-cancel").click();
  assert.deepEqual(await savedShelf(page), stored);
  await page.keyboard.press("Escape");
  assert.equal(await shelf(page).evaluate(element => element.open), false);
  assert.equal(await page.locator("#shelf-open").evaluate(element => element === document.activeElement), true);
  assert.equal(await page.locator("#watch-file-preview").isVisible(), true);
  assert.equal(await page.locator("#watch-file-preview-title").textContent(), title);
  assert.deepEqual(await probe(page), before);
  await page.locator("#watch-file-confirm").click();
  assert.deepEqual(await download(page, "manual-after-shelf-cancel.json"), candidate.buffer);
  await openShelf(page);
  await row(page, id).getByRole("button", { name: "Remove from shelf", exact: true }).click();
  await page.locator("#shelf-remove-confirm").click();
  assert.equal((await savedShelf(page)).entries.length, 0);
  assert.equal(await primary(page), candidate.buffer.toString(), "removing a shelf entry does not remove the active watch");
});

test("observed and unobserved shelf changes refuse replacement, and a primary-save change still invalidates its review", async t => {
  const { page, context } = await open(t);
  const candidate = file("candidate.json");
  const active = file("active.json", [["gate", "south"]], 2);
  await adoptFile(page, candidate);
  await openShelf(page);
  await keep(page, "Original shelf name");
  const id = (await savedShelf(page)).entries[0].id;
  await closeShelf(page);
  await adoptFile(page, active);
  const before = await probe(page);
  await openShelf(page);
  await row(page, id).getByRole("button", { name: "Open watch", exact: true }).click();
  await page.locator("#watch-file-preview").waitFor({ state: "visible" });
  const other = await context.newPage();
  await other.goto(server.url);
  await other.evaluate(() => {
    const value = JSON.parse(localStorage.getItem("longwater.shelf.v1"));
    value.entries[0].name = "Changed in the other tab";
    localStorage.setItem("longwater.shelf.v1", JSON.stringify(value));
  });
  await page.waitForFunction(() => /changed in another tab/.test(document.querySelector("#shelf-entry-status").textContent));
  await page.locator("#watch-file-confirm").click();
  assert.match(await page.locator("#watch-file-status").textContent(), /shelf.*changed|shelf.*current/i);
  assert.deepEqual(await probe(page), before);
  await openShelf(page);
  await row(page, id).getByRole("button", { name: "Open watch", exact: true }).click();
  await page.locator("#watch-file-preview").waitFor({ state: "visible" });
  await page.evaluate(() => {
    const value = JSON.parse(localStorage.getItem("longwater.shelf.v1"));
    value.entries[0].name = "Unobserved local change";
    localStorage.setItem("longwater.shelf.v1", JSON.stringify(value));
  });
  await page.locator("#watch-file-confirm").click();
  assert.deepEqual(await probe(page), before, "the final guard rereads storage even without a storage event");
  await openShelf(page);
  await row(page, id).getByRole("button", { name: "Open watch", exact: true }).click();
  await page.locator("#watch-file-preview").waitFor({ state: "visible" });
  await other.evaluate(raw => localStorage.setItem("longwater.watch.v1", raw), candidate.buffer.toString());
  await page.locator("#watch-file-preview").waitFor({ state: "hidden" });
  assert.match(await page.locator("#watch-save-status").textContent(), /changed in another tab/);
  assert.deepEqual(await download(page, "active-after-stale-source.json"), active.buffer);
});

test("a delayed shelf File cannot revive after source change or supersede a newer manual-file review", async t => {
  const { page } = await open(t);
  const candidate = file("candidate.json");
  const newer = file("newer-manual.json", [["gate", "south"]], 2);
  await adoptFile(page, candidate);
  await openShelf(page);
  await keep(page, "Delayed");
  const id = (await savedShelf(page)).entries[0].id;
  await closeShelf(page);
  await adoptFile(page, newer);
  const before = await probe(page);
  await page.evaluate(() => {
    const original = File.prototype.text;
    window.__shelfOriginalText = original;
    File.prototype.text = function () {
      if (this.name === "Delayed.json") return new Promise((resolve, reject) => {
        window.__releaseShelfText = () => original.call(this).then(resolve, reject);
      });
      return original.call(this);
    };
  });
  await openShelf(page);
  await row(page, id).getByRole("button", { name: "Open watch", exact: true }).click();
  await page.waitForFunction(() => typeof window.__releaseShelfText === "function");
  await page.evaluate(() => {
    const value = JSON.parse(localStorage.getItem("longwater.shelf.v1"));
    value.entries[0].name = "Changed during read";
    localStorage.setItem("longwater.shelf.v1", JSON.stringify(value));
    window.__releaseShelfText();
  });
  await page.waitForFunction(() => /shelf/.test(document.querySelector("#watch-file-status").textContent));
  assert.equal(await page.locator("#watch-file-preview").isVisible(), false);
  assert.deepEqual(await probe(page), before);
  await openShelf(page);
  await row(page, id).getByRole("button", { name: "Rename", exact: true }).click();
  await page.locator("#shelf-rename-name").fill("Delayed");
  await page.locator("#shelf-rename").getByRole("button", { name: "Save name", exact: true }).click();
  await page.evaluate(() => { delete window.__releaseShelfText; });
  await row(page, id).getByRole("button", { name: "Open watch", exact: true }).click();
  await page.waitForFunction(() => typeof window.__releaseShelfText === "function");
  await chooseFile(page, newer);
  const manualTitle = await page.locator("#watch-file-preview-title").textContent();
  await page.evaluate(async () => {
    await window.__releaseShelfText();
    File.prototype.text = window.__shelfOriginalText;
  });
  assert.equal(await page.locator("#watch-file-preview-title").textContent(), manualTitle);
  await page.locator("#watch-file-confirm").click();
  assert.deepEqual(await download(page, "newer-manual-after-delayed-shelf.json"), newer.buffer);
});

test("quota, unavailable storage and corrupted entries stay visible without false saved success", async t => {
  const { page } = await open(t, {}, () => {
    window.__shelfQuota = true;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "longwater.shelf.v1" && window.__shelfQuota) throw new DOMException("Quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.locator('[data-action="shade"]').click();
  const before = await probe(page);
  await openShelf(page);
  await keep(page, "Keep after recovery");
  assert.match(await page.locator("#shelf-status").textContent(), /could not be saved/);
  assert.equal(await page.evaluate(() => localStorage.getItem("longwater.shelf.v1")), null);
  assert.equal(await page.locator("#shelf-name").inputValue(), "Keep after recovery");
  assert.deepEqual(await probe(page), before);
  await page.evaluate(() => { window.__shelfQuota = false; });
  await page.locator("#shelf-refresh").click();
  await page.locator("#shelf-keep").click();
  const stored = await savedShelf(page);
  const invalid = { ...stored, entries: [{ ...stored.entries[0], watch: '{"version":1}' }] };
  await page.evaluate(value => localStorage.setItem("longwater.shelf.v1", JSON.stringify(value)), invalid);
  await page.locator("#shelf-refresh").click();
  assert.match(await page.locator("#shelf-list").textContent(), /cannot be opened/);
  assert.equal(await page.locator("#shelf-list").getByRole("button", { name: "Open watch", exact: true }).isDisabled(), true);
  assert.deepEqual(await savedShelf(page), invalid);
  await page.evaluate(() => localStorage.setItem("longwater.shelf.v1", "{unsupported"));
  await page.locator("#shelf-refresh").click();
  assert.equal(await page.locator("#shelf-keep").isDisabled(), true);
  assert.match(await page.locator("#shelf-status").textContent(), /unreadable or from another version/);
  assert.equal(await page.evaluate(() => localStorage.getItem("longwater.shelf.v1")), "{unsupported");
  await closeShelf(page);
  const unavailable = await open(t, {}, () => {
    Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("Unavailable", "SecurityError"); } });
  });
  await openShelf(unavailable.page);
  assert.equal(await unavailable.page.locator("#shelf-keep").isDisabled(), true);
  assert.match(await unavailable.page.locator("#shelf-status").textContent(), /could not be read/);
  await closeShelf(unavailable.page);
  const bytes = await download(unavailable.page, "unavailable-storage-opening.json");
  assert.equal(JSON.parse(JSON.parse(bytes).snapshot).day, 0);
});

test("native keyboard operation, literal names and readable phone layout work in the actual offline artifact", async t => {
  const url = pathToFileURL(new URL("../downloads/Longwater-Fourteen-Tides.html", import.meta.url).pathname).href;
  const { page, context } = await open(t, { offline: true, viewport: { width: 390, height: 844 } }, null, url);
  const unexpected = [];
  context.on("request", request => {
    if (!request.url().startsWith("file:") && !request.url().startsWith("data:")) unexpected.push(request.url());
  });
  const before = await probe(page);
  await page.locator("#shelf-open").focus();
  await page.keyboard.press("Enter");
  assert.equal(await shelf(page).evaluate(element => element.open), true);
  assert.equal(await page.locator("#shelf-name").evaluate(element => element === document.activeElement), true);
  const literal = "<img src=x onerror=alert(1)> · 🦆 marsh";
  await page.locator("#shelf-name").fill(literal);
  await page.keyboard.press("Enter");
  assert.equal(await page.locator("#shelf-list h3").textContent(), literal);
  assert.equal(await page.locator("#shelf-list img").count(), 0);
  assert.deepEqual(await probe(page), before);
  await page.addStyleTag({ content: ".watch-shelf { font-size: 24px; }" });
  assert.ok(await shelf(page).evaluate(element => element.scrollWidth <= element.clientWidth + 1));
  const keyboardFocus = [];
  for (let index = 0; index < 16; index++) {
    await page.keyboard.press("Tab");
    const focus = await shelf(page).evaluate(element => ({
      inside: element.contains(document.activeElement),
      body: document.activeElement === document.body,
      documentFocused: document.hasFocus(),
      modal: element.matches(":modal"),
    }));
    keyboardFocus.push(focus);
    assert.equal(focus.modal, true, "the shelf remains a native modal");
    assert.ok(focus.inside || (focus.body && !focus.documentFocused),
      "Tab stays inside the modal or leaves the document; background controls remain unreachable");
    if (!focus.inside) {
      await page.keyboard.press("Tab");
      assert.equal(await shelf(page).evaluate(element =>
        element.contains(document.activeElement) && document.hasFocus()), true,
      "the next Tab returns from browser focus to the modal");
    }
  }
  const layout = await shelf(page).evaluate(element => ({
    viewport: innerWidth, bounds: { left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right },
    scroll: element.scrollWidth, client: element.clientWidth,
    controls: [...element.querySelectorAll("button,input")].filter(control => control.getClientRects().length).map(control => {
      const rect = control.getBoundingClientRect();
      return { label: control.textContent || control.id, left: rect.left, right: rect.right, height: rect.height };
    }),
  }));
  assert.ok(layout.bounds.left >= 0 && layout.bounds.right <= 391);
  for (const control of layout.controls) {
    assert.ok(control.left >= layout.bounds.left && control.right <= layout.bounds.right + 1, control.label + " fits horizontally");
    assert.ok(control.height >= 44, control.label + " has a full touch target");
  }
  observations.push({ case: "offline-phone-large-text", layout, literalName: literal, keyboardFocus });
  await page.screenshot({ path: new URL("shelf-offline-phone.png", captureDirectory).pathname });
  await page.keyboard.press("Escape");
  assert.equal(await shelf(page).evaluate(element => element.open), false);
  assert.equal(await page.locator("#shelf-open").evaluate(element => element === document.activeElement), true);
  const stored = await savedShelf(page);
  await page.locator('[data-action="gate"]').click();
  await openShelf(page);
  await row(page, stored.entries[0].id).getByRole("button", { name: "Open watch", exact: true }).click();
  await page.locator("#watch-file-preview").waitFor({ state: "visible" });
  await page.locator("#watch-file-confirm").click();
  assert.equal(JSON.parse(await primary(page)).turns.length, 0);
  await page.reload();
  await page.waitForFunction(() => !document.querySelector("#shelf-open").disabled);
  await openShelf(page);
  assert.deepEqual(await savedShelf(page), stored);
  assert.equal(await page.locator("#shelf-list h3").textContent(), literal);
  assert.deepEqual(unexpected, [], "offline reopening fetches no external assets");
});

test("a completed shelf watch reopens with its exact outcome and all fourteen journal entries", async t => {
  const { page } = await open(t);
  const native = new BrowserSession();
  const turns = [];
  try {
    while (!JSON.parse(native.snapshot_json()).finished) {
      const state = JSON.parse(native.snapshot_json());
      const index = state.cells.findIndex(cell => cell.shade < 3);
      const cell = ["north", "heart", "south"][index < 0 ? 0 : index];
      const action = index >= 0 ? "shade" : state.freshwater > 0 ? "gate" : "seed";
      native.take_turn(action, cell);
      turns.push([action, cell]);
    }
  } finally { native.free(); }
  const completed = file("completed.json", turns, 0);
  await adoptFile(page, completed);
  await openShelf(page);
  await keep(page, "Completed watch");
  const entry = (await savedShelf(page)).entries[0];
  assert.match(await row(page, entry.id).textContent(), /Day 14.*Watch complete: resilient/);
  await closeShelf(page);
  await page.locator("#reset-control").click();
  await page.locator("#start-new-watch").click();
  assert.equal(JSON.parse(await primary(page)).turns.length, 0);
  await openShelf(page);
  await row(page, entry.id).getByRole("button", { name: "Open watch", exact: true }).click();
  await page.locator("#watch-file-preview").waitFor({ state: "visible" });
  await page.locator("#watch-file-confirm").click();
  assert.equal(await page.locator("#journal-entries > li").count(), 14);
  assert.match(await page.locator("#state-summary").textContent(), /Watch closed.*resilient/);
  assert.equal(await page.locator('[data-action="gate"]').getAttribute("aria-disabled"), "true");
  assert.deepEqual(await download(page, "completed-reopened.json"), completed.buffer);
});
