import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { serve } from "./server.mjs";
import { initSync, BrowserSession } from "../pkg/longwater_web.js";
import { SIMULATION_REVISION, WATCH_SAVE_KEY } from "../watch-save.js";

initSync({ module: await readFile(new URL("../pkg/longwater_web_bg.wasm", import.meta.url)) });
let browser, server, packaged;
const errors = [];
before(async () => {
  await mkdir(new URL("../test-results/", import.meta.url), { recursive: true });
  server = await serve();
  packaged = JSON.parse(execFileSync(process.execPath, ["scripts/package.mjs", "test-results/Longwater-watch-transfer.html"], { encoding: "utf8" }));
  browser = await chromium.launch({ headless: true, executablePath: process.env.LONGWATER_CHROME_PATH || undefined });
});
after(async () => {
  await browser?.close();
  await server?.close();
  assert.deepEqual(errors, [], "no uncaught browser errors");
});

function nativeFile(complete = false) {
  const session = new BrowserSession();
  const turns = [];
  const snapshots = [session.snapshot_json()];
  const take = (action, cell) => {
    snapshots.push(session.take_turn(action, cell));
    turns.push({ action, cell });
  };
  try {
    if (complete) {
      while (!JSON.parse(session.snapshot_json()).finished) {
        const state = JSON.parse(session.snapshot_json());
        const index = state.cells.findIndex(cell => cell.shade < 3);
        const cell = state.cells[index < 0 ? 0 : index].id;
        take(index >= 0 ? "shade" : state.freshwater > 0 ? "gate" : "seed", cell);
      }
    } else {
      take("shade", "heart");
      take("gate", "north");
      take("seed", "south");
    }
    const raw = JSON.stringify({
      version: 1, simulation: SIMULATION_REVISION, turns, selected: "south", snapshot: session.snapshot_json(),
    });
    return { raw, snapshots, state: JSON.parse(session.snapshot_json()) };
  } finally { session.free(); }
}

async function ready(page) {
  page.setDefaultTimeout(7000);
  page.on("pageerror", error => errors.push(error.message.slice(0, 400)));
  await page.waitForFunction(() => !document.querySelector("#watch-file-open")?.disabled);
  assert.equal(await page.locator("#startup-error").isVisible(), false);
}
async function open(t, options = {}, init) {
  const context = await browser.newContext(options);
  t.after(() => context.close());
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  await page.goto(server.url);
  await ready(page);
  return { page, context };
}
const day = async page => Number((await page.locator("#state-summary").textContent()).match(/Day (\d+)/)[1]);
const stored = page => page.evaluate(key => localStorage.getItem(key), WATCH_SAVE_KEY);
const journal = page => page.locator("#journal-entries").textContent();

async function choose(page, raw, name = "Longwater-watch.json", useKeyboard = false) {
  const selected = page.waitForEvent("filechooser");
  const button = page.getByRole("button", { name: "Open watch file", exact: true });
  if (useKeyboard) { await button.focus(); await button.press("Space"); }
  else await button.click();
  await (await selected).setFiles({ name, mimeType: "application/json", buffer: Buffer.from(raw) });
}
async function preview(page, raw, name) {
  await choose(page, raw, name);
  await page.locator("#watch-file-preview").waitFor({ state: "visible" });
}
async function replace(page) {
  await page.getByRole("button", { name: "Replace current watch", exact: true }).click();
  await page.locator("#watch-file-preview").waitFor({ state: "hidden" });
  assert.match(await page.locator("#watch-file-status").textContent(), /Opened day/);
}
async function download(page) {
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download watch", exact: true }).click();
  const file = await event;
  const stream = await file.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return { name: file.suggestedFilename(), raw: Buffer.concat(chunks).toString("utf8") };
}
async function playSample(page) {
  await page.locator('[data-action="shade"]').click();
  await page.locator('[data-cell="0"]').click();
  await page.locator('[data-action="gate"]').click();
  await page.locator('[data-cell="2"]').click();
  await page.locator('[data-action="seed"]').click();
}

test("a real download transfers the exact partial watch and journal into another browser only after confirmation", async t => {
  const { page: source } = await open(t);
  await playSample(source);
  const readings = await source.locator("#state-summary").textContent();
  const reports = await journal(source);
  const original = await stored(source);
  const file = await download(source);
  assert.equal(file.name, "Longwater-watch-day-3.json");
  assert.equal(file.raw, original);
  assert.equal(await stored(source), original);
  const { page: target } = await open(t);
  await target.locator('[data-action="gate"]').click();
  const before = await stored(target), beforeJournal = await journal(target);
  await preview(target, file.raw, "watch-<img onerror=alert(1)>.json");
  assert.equal(await day(target), 1);
  assert.equal(await stored(target), before);
  assert.equal(await journal(target), beforeJournal);
  assert.equal(await target.locator("#watch-file-preview img").count(), 0);
  assert.match(await target.locator("#watch-file-preview-title").textContent(), /<img onerror=alert\(1\)>/);
  assert.match(await target.locator("#watch-file-summary").textContent(), /Day 3 of 14.*South Reach/);
  await target.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(await day(target), 1);
  assert.equal(await stored(target), before);
  assert.equal(await target.locator("#watch-file-open").evaluate(el => el === document.activeElement), true);
  await preview(target, file.raw);
  await replace(target);
  assert.equal(await stored(target), file.raw);
  assert.equal(await target.locator("#state-summary").textContent(), readings);
  assert.equal(await journal(target), reports);
  assert.equal(await target.locator('[data-cell="2"]').getAttribute("aria-pressed"), "true");
  await target.reload();
  await ready(target);
  assert.equal(await day(target), 3);
  assert.equal(await journal(target), reports);
  assert.equal((await download(target)).raw, file.raw);
  assert.equal(await source.locator("#state-summary").textContent(), readings, "the exporting page remains unchanged");
});

test("a complete native watch and journal transfer through the offline HTML without external requests", async t => {
  const complete = nativeFile(true);
  const { page: source } = await open(t);
  await preview(source, complete.raw);
  assert.match(await source.locator("#watch-file-summary").textContent(), /Day 14 of 14.*Watch complete/);
  await replace(source);
  assert.equal(await source.locator("#journal-entries > li").count(), 14);
  assert.match(await source.locator("#state-summary").textContent(), /Watch closed/);
  assert.ok((await source.locator("#watch-journal").textContent()).includes(complete.state.outcome));
  const file = await download(source);
  assert.equal(file.raw, complete.raw);
  const reports = await journal(source);
  const context = await browser.newContext({ offline: true });
  t.after(() => context.close());
  const url = pathToFileURL(packaged.file).href;
  const requests = [];
  context.on("request", request => {
    if (request.url() !== url && !/^(data|blob):/.test(request.url())) requests.push(request.url());
  });
  const page = await context.newPage();
  await page.goto(url);
  await ready(page);
  assert.equal(await day(page), 0);
  await preview(page, file.raw);
  await replace(page);
  assert.equal(await day(page), 14);
  assert.equal(await journal(page), reports);
  assert.equal((await download(page)).raw, complete.raw);
  await page.reload();
  await ready(page);
  assert.equal(await day(page), 14);
  assert.equal(await journal(page), reports);
  assert.deepEqual(requests, []);
});

test("late file reads cannot replace subsequent play, selection, reset or a newer file preview", async t => {
  const raw = nativeFile().raw;
  const { page } = await open(t);
  await page.evaluate(() => {
    const original = File.prototype.text;
    window.watchFileReads = [];
    File.prototype.text = function () {
      const file = this;
      return new Promise((resolve, reject) => {
        original.call(file).then(raw => window.watchFileReads.push({ name: file.name, release: () => resolve(raw) }), reject);
      });
    };
  });
  const mutate = [
    () => page.locator('[data-action="gate"]').click(),
    () => page.locator('[data-cell="0"]').click(),
    async () => { await page.locator("#reset-control").click(); await page.locator("#start-new-watch").click(); },
  ];
  for (let index = 0; index < mutate.length; index++) {
    await page.locator("#reset-control").click();
    await page.locator("#start-new-watch").click();
    await choose(page, raw, "delayed-" + index + ".json");
    await page.waitForFunction(count => window.watchFileReads.length === count, index + 1);
    await mutate[index]();
    const before = await stored(page), currentDay = await day(page);
    await page.evaluate(index => window.watchFileReads[index].release(), index);
    await page.waitForFunction(() => document.querySelector("#watch-file-status").textContent.includes("watch changed"));
    assert.equal(await page.locator("#watch-file-preview").isVisible(), false);
    assert.equal(await day(page), currentDay);
    assert.equal(await stored(page), before);
  }
  await choose(page, raw, "older.json");
  await page.waitForFunction(() => window.watchFileReads.length === 4);
  await choose(page, nativeFile(true).raw, "newer.json");
  await page.waitForFunction(() => window.watchFileReads.length === 5);
  await page.evaluate(() => window.watchFileReads[4].release());
  await page.locator("#watch-file-preview").waitFor({ state: "visible" });
  assert.match(await page.locator("#watch-file-summary").textContent(), /Day 14/);
  await page.evaluate(() => window.watchFileReads[3].release());
  assert.equal(await page.locator("#watch-file-preview-title").textContent(), "Open newer.json?");
  assert.match(await page.locator("#watch-file-summary").textContent(), /Day 14/);
});

test("play and reset invalidate an already visible preview and cancellation keeps the same file reusable", async t => {
  const { page } = await open(t);
  const raw = nativeFile().raw;
  for (const mutate of [
    () => page.locator('[data-action="gate"]').click(),
    () => page.locator('[data-cell="0"]').click(),
    async () => { await page.locator("#reset-control").click(); await page.locator("#start-new-watch").click(); },
  ]) {
    await page.locator("#reset-control").click();
    await page.locator("#start-new-watch").click();
    await preview(page, raw);
    await mutate();
    assert.equal(await page.locator("#watch-file-preview").isVisible(), false);
    assert.match(await page.locator("#watch-file-status").textContent(), /watch changed/);
  }
  await preview(page, raw);
  const before = await stored(page), snapshot = await page.locator("#state-summary").textContent();
  await page.locator("#watch-file-preview").press("Escape");
  assert.equal(await page.locator("#watch-file-preview").isVisible(), false);
  assert.equal(await stored(page), before);
  for (const key of ["g", "h", "s", "r"]) await page.locator("#watch-file-open").press(key);
  assert.equal(await page.locator("#state-summary").textContent(), snapshot);
  await preview(page, raw);
  assert.equal(await page.locator("#watch-file-input").inputValue(), "");
  await replace(page);
  assert.equal(await day(page), 3);
});

test("invalid or oversized input and failed file reads keep active progress and stored bytes", async t => {
  const { page } = await open(t);
  await page.locator('[data-action="gate"]').click();
  const before = await stored(page), reports = await journal(page);
  const valid = nativeFile().raw;
  const edit = fn => { const value = JSON.parse(valid); fn(value); return JSON.stringify(value); };
  const invalid = [
    "not JSON",
    edit(value => { value.simulation = "wrong version"; }),
    edit(value => { value.turns[0].cell = "north"; }),
  ];
  for (const raw of invalid) {
    await choose(page, raw);
    await page.waitForFunction(() => document.querySelector("#watch-file-status").textContent.includes("could not be opened"));
    assert.equal(await page.locator("#watch-file-preview").isVisible(), false);
    assert.equal(await stored(page), before);
    assert.equal(await journal(page), reports);
  }
  await page.evaluate(() => {
    const original = File.prototype.text;
    window.watchFileReadCalls = 0;
    window.restoreWatchFileRead = () => { File.prototype.text = original; };
    File.prototype.text = function () { window.watchFileReadCalls++; return Promise.reject(new Error("read failed")); };
  });
  await choose(page, " ".repeat(32769));
  await page.waitForFunction(() => document.querySelector("#watch-file-status").textContent.includes("too large"));
  assert.equal(await page.evaluate(() => window.watchFileReadCalls), 0, "oversized files are refused before reading");
  await choose(page, valid);
  await page.waitForFunction(() => document.querySelector("#watch-file-status").textContent.includes("could not be opened"));
  assert.equal(await page.evaluate(() => window.watchFileReadCalls), 1);
  assert.equal(await stored(page), before);
  assert.equal(await day(page), 1);
  await page.evaluate(() => window.restoreWatchFileRead());
});

test("an opened but unsaved watch remains exportable and retries without duplicating journal tides", async t => {
  const { page } = await open(t);
  await page.locator('[data-action="gate"]').click();
  const prior = await stored(page);
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException("Full", "QuotaExceededError");
      return original.call(this, name, value);
    };
    window.restoreWatchSaving = () => { Storage.prototype.setItem = original; };
  }, WATCH_SAVE_KEY);
  const raw = nativeFile().raw;
  await preview(page, raw);
  await replace(page);
  assert.equal(await day(page), 3);
  assert.equal(await page.locator("#journal-entries > li").count(), 3);
  assert.equal(await stored(page), prior);
  assert.match(await page.locator("#watch-file-status").textContent(), /saving has not succeeded/);
  assert.match(await page.locator("#watch-save-status").textContent(), /could not be saved/);
  assert.equal((await download(page)).raw, raw);
  await page.evaluate(() => window.restoreWatchSaving());
  await page.getByRole("button", { name: "Try saving again", exact: true }).click();
  assert.equal(await stored(page), raw);
  assert.equal(await page.locator("#journal-entries > li").count(), 3);
  await page.reload();
  await ready(page);
  assert.equal(await day(page), 3);
  assert.equal(await page.locator("#journal-entries > li").count(), 3);
});

test("a blocked browser store does not prevent opening, reviewing or downloading a watch", async t => {
  const { page } = await open(t, {}, () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() { throw new DOMException("Blocked", "SecurityError"); },
    });
  });
  const raw = nativeFile().raw;
  await preview(page, raw);
  await replace(page);
  assert.equal(await day(page), 3);
  assert.equal(await page.locator("#journal-entries > li").count(), 3);
  assert.match(await page.locator("#watch-file-status").textContent(), /saving has not succeeded/);
  assert.equal((await download(page)).raw, raw);
});

test("a true second-tab write cancels review and only a fresh explicit review can replace it", async t => {
  const { page, context } = await open(t);
  await page.locator('[data-action="gate"]').click();
  const other = await context.newPage();
  await other.goto(server.url);
  await ready(other);
  const raw = nativeFile().raw;
  await preview(page, raw);
  await other.locator('[data-action="shade"]').click();
  const winning = await stored(other);
  await page.waitForFunction(() => document.querySelector("#watch-file-preview").hidden);
  assert.equal(await day(page), 1);
  assert.equal(await stored(page), winning);
  assert.match(await page.locator("#watch-file-status").textContent(), /saved watch changed/);
  await preview(page, raw);
  assert.equal(await stored(page), winning);
  await replace(page);
  assert.equal(await stored(page), raw);
  assert.equal(await day(other), 2);
  await other.waitForFunction(() => document.querySelector("#watch-save-status").textContent.includes("another tab"));
});

test("phone preview wraps long names, keeps touch targets and supports keyboard confirmation and cancellation", async t => {
  for (const width of [320, 390]) {
    const { page } = await open(t, { viewport: { width, height: 720 }, isMobile: true, hasTouch: true });
    const raw = nativeFile().raw;
    await choose(page, raw, "saved-watch-" + "long-name-".repeat(24) + ".json", true);
    await page.locator("#watch-file-preview").waitFor({ state: "visible" });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    for (const id of ["watch-file-download", "watch-file-open", "watch-file-confirm", "watch-file-cancel"]) {
      const box = await page.locator("#" + id).boundingBox();
      assert.ok(box.height >= 44);
      assert.ok(box.width <= width);
    }
    assert.equal(await page.locator("#watch-file-preview").evaluate(el => el === document.activeElement), true);
    await page.keyboard.press("Tab");
    assert.equal(await page.locator("#watch-file-confirm").evaluate(el => el === document.activeElement), true);
    await page.keyboard.press("Tab");
    assert.equal(await page.locator("#watch-file-cancel").evaluate(el => el === document.activeElement), true);
    await page.screenshot({ path: new URL("../test-results/watch-file-phone-" + width + ".png", import.meta.url).pathname, fullPage: true });
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#watch-file-open").evaluate(el => el === document.activeElement), true);
    assert.equal(await day(page), 0);
    await choose(page, raw, "watch.json", true);
    await page.locator("#watch-file-preview").waitFor({ state: "visible" });
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    assert.equal(await day(page), 3);
    assert.equal(await page.locator("#watch-file-preview").isVisible(), false);
  }
});

test("post-adoption display failure reports the opened watch, freezes stale controls and preserves download recovery", async t => {
  for (const unsaved of [false, true]) {
    const { page } = await open(t);
    await page.locator('[data-action="gate"]').click();
    const prior = await stored(page);
    await page.evaluate(async ({ key, unsaved }) => {
      const { SavedWatch } = await import("/watch-save.js");
      const originalReplay = SavedWatch.prototype.replayHistory;
      SavedWatch.prototype.replayHistory = function () {
        SavedWatch.prototype.replayHistory = originalReplay;
        throw new Error("Authored post-adoption native allocation refusal");
      };
      const originalWrite = Storage.prototype.setItem;
      if (unsaved) {
        Storage.prototype.setItem = function (name, value) {
          if (name === key) throw new DOMException("Full", "QuotaExceededError");
          return originalWrite.call(this, name, value);
        };
      }
      window.restoreWatchSaving = () => { Storage.prototype.setItem = originalWrite; };
    }, { key: WATCH_SAVE_KEY, unsaved });
    const raw = nativeFile().raw;
    await preview(page, raw);
    await page.getByRole("button", { name: "Replace current watch", exact: true }).click();
    await page.locator("#watch-file-preview").waitFor({ state: "hidden" });
    const status = await page.locator("#watch-file-status").textContent();
    assert.match(status, /Opened day 3/);
    assert.match(status, /display could not be refreshed/);
    assert.doesNotMatch(status, /current watch has been kept/);
    assert.equal(await page.locator(".game-control:disabled").count(), 7, "stale display cannot accept more play");
    assert.equal(await page.locator("#watch-journal").isVisible(), false, "stale journal and report are hidden after adoption");
    assert.equal(await page.locator("#watch-report-download").isVisible(), false, "the previous watch cannot be downloaded as the active report");
    assert.equal((await download(page)).raw, raw, "the actually opened watch remains downloadable");
    assert.equal(await stored(page), unsaved ? prior : raw);
    if (unsaved) {
      assert.match(status, /Download watch before reloading/);
      await page.evaluate(() => window.restoreWatchSaving());
      await page.getByRole("button", { name: "Try saving again", exact: true }).click();
      assert.equal(await stored(page), raw);
    } else assert.match(status, /saved in this browser.*Reload/);
    // A deliberate same-page restore rebuilds the journal and reopens report access.
    await preview(page, raw);
    await replace(page);
    assert.equal(await page.locator("#watch-journal").isVisible(), true);
    assert.equal(await page.locator("#journal-entries > li").count(), 3);
    assert.equal(await page.locator("#watch-report-download").isVisible(), true);
    assert.equal(await page.locator("#watch-report-download").isDisabled(), false);
    assert.equal(await page.locator(".game-control:disabled").count(), 0);
    await page.reload();
    await ready(page);
    assert.equal(await day(page), 3);
    assert.equal(await page.locator("#journal-entries > li").count(), 3);
    assert.equal(await page.locator(".game-control:disabled").count(), 0);
  }
});

test("new-watch Keep and Escape preserve a file preview until deliberate replacement online and offline", async t => {
  for (const offline of [false, true]) {
    const context = await browser.newContext({ offline });
    t.after(() => context.close());
    const page = await context.newPage();
    await page.goto(offline ? pathToFileURL(packaged.file).href : server.url);
    await ready(page);
    await page.locator('[data-action="gate"]').click();
    const original = { raw: await stored(page), day: await day(page), journal: await journal(page) };
    const incoming = nativeFile();
    await preview(page, incoming.raw);
    for (const cancel of ["keep", "escape"]) {
      await page.locator("#reset-control").click();
      assert.equal(await page.locator("#new-watch-review").isVisible(), true);
      assert.equal(await page.locator("#keep-watch").evaluate(node => node === document.activeElement), true);
      if (cancel === "keep") await page.locator("#keep-watch").press("Enter");
      else await page.locator("#keep-watch").press("Escape");
      assert.equal(await page.locator("#new-watch-review").isVisible(), false);
      assert.equal(await page.locator("#watch-file-preview").isVisible(), true);
      assert.deepEqual({ raw: await stored(page), day: await day(page), journal: await journal(page) }, original);
    }
    await replace(page);
    assert.equal(await stored(page), incoming.raw);
    assert.equal(await day(page), 3);
    await page.locator("#reset-control").press("r");
    assert.match(await page.locator("#new-watch-progress").textContent(), /3 of 14/);
    await page.locator("#start-new-watch").click();
    assert.equal(await day(page), 0);
    assert.equal(JSON.parse(await stored(page)).turns.length, 0);
    assert.equal(await page.locator("#journal-entries").textContent(), "");
    assert.equal(await page.locator("#watch-file-preview").isVisible(), false);
  }
});
