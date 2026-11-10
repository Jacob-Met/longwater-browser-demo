import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { serve } from "./server.mjs";
import { initSync, BrowserSession } from "../pkg/longwater_web.js";
import { SIMULATION_REVISION, WATCH_SAVE_KEY } from "../watch-save.js";

const CELLS = ["north", "heart", "south"];
const TURNS = [["shade", "heart"], ["gate", "north"], ["seed", "south"]];
let browser, server;
before(async () => {
  initSync({ module: await readFile(new URL("../pkg/longwater_web_bg.wasm", import.meta.url)) });
  await mkdir("test-results/watch-rewind", { recursive: true });
  server = await serve();
  browser = await chromium.launch({ headless: true, executablePath: process.env.LONGWATER_CHROME_PATH || undefined });
});
after(async () => { await browser?.close(); await server?.close(); });

// Expected progress comes from the unchanged native simulation, independently
// of SavedWatch's rewind implementation and the browser controller.
function nativeFile(turns = TURNS, selected = "south") {
  const native = new BrowserSession();
  try {
    const snapshots = [native.snapshot_json()];
    for (const [action, cell] of turns) snapshots.push(native.take_turn(action, cell));
    return {
      raw: JSON.stringify({ version: 1, simulation: SIMULATION_REVISION,
        turns: turns.map(([action, cell]) => ({ action, cell })), selected, snapshot: snapshots.at(-1) }),
      snapshots, state: JSON.parse(snapshots.at(-1)),
    };
  } finally { native.free(); }
}
function completeTurns() {
  const native = new BrowserSession(), turns = [];
  try {
    while (!JSON.parse(native.snapshot_json()).finished) {
      const state = JSON.parse(native.snapshot_json());
      const index = state.cells.findIndex(cell => cell.shade < 3);
      const cell = state.cells[index < 0 ? 0 : index].id;
      const action = index >= 0 ? "shade" : state.freshwater > 0 ? "gate" : "seed";
      native.take_turn(action, cell); turns.push([action, cell]);
    }
    return turns;
  } finally { native.free(); }
}
async function ready(page) {
  await page.waitForFunction(() => !document.querySelector("#watch-file-open")?.disabled);
  assert.equal(await page.locator("#startup-error").isVisible(), false);
}
async function open(t, options = {}) {
  const context = await browser.newContext(options);
  const errors = [];
  context.on("page", page => page.on("pageerror", error => errors.push(error.message)));
  t.after(async () => { await context.close(); assert.deepEqual(errors, [], "no uncaught browser errors"); });
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  await page.goto(server.url); await ready(page);
  return { page, context };
}
const day = async page => Number((await page.locator("#state-summary").textContent()).match(/Day (\d+)/)[1]);
const stored = page => page.evaluate(key => localStorage.getItem(key), WATCH_SAVE_KEY);
async function facts(page) {
  return page.evaluate(key => ({
    saved: localStorage.getItem(key),
    summary: document.querySelector("#state-summary").textContent,
    readings: [...document.querySelectorAll('[id^="cell-"][id$="-readings"]')].map(el => el.textContent),
    selected: [...document.querySelectorAll("[data-cell]")].map(el => el.getAttribute("aria-pressed")),
    journal: document.querySelector("#watch-journal").innerHTML,
    comparison: document.querySelector("#watch-choice").innerHTML,
    saveStatus: document.querySelector("#watch-save-status").textContent,
  }), WATCH_SAVE_KEY);
}
async function play(page, turns = TURNS) {
  for (const [action, cell] of turns) {
    const prior = await day(page);
    await page.locator('[data-cell="' + CELLS.indexOf(cell) + '"]').click();
    const button = page.locator('[data-action="' + action + '"]');
    assert.notEqual(await button.getAttribute("aria-disabled"), "true");
    await button.click(); assert.equal(await day(page), prior + 1);
  }
}
async function review(page) {
  await page.locator("#watch-rewind-open").click();
  await page.locator("#watch-rewind-review").waitFor({ state: "visible" });
  assert.equal(await page.locator("#watch-rewind-keep").evaluate(el => el === document.activeElement), true);
}
async function confirm(page) {
  await page.locator("#watch-rewind-confirm").click();
  await page.locator("#watch-rewind-review").waitFor({ state: "hidden" });
}
async function choose(page, raw) {
  const event = page.waitForEvent("filechooser");
  await page.locator("#watch-file-open").click();
  await (await event).setFiles({ name: "rewind-native-fixture.json", mimeType: "application/json", buffer: Buffer.from(raw) });
  await page.locator("#watch-file-preview").waitFor({ state: "visible" });
}
async function adopt(page, raw) {
  await choose(page, raw);
  await page.getByRole("button", { name: "Replace current watch", exact: true }).click();
  await page.locator("#watch-file-preview").waitFor({ state: "hidden" });
}
async function download(page) {
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download watch", exact: true }).click();
  const file = await event;
  assert.equal(await file.failure(), null);
  const stream = await file.createReadStream(), chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}
async function comparison(page) {
  if (!await page.locator("#choice-details").evaluate(el => el.open)) await page.locator("#choice-details > summary").click();
  await page.locator("#choice-tide").selectOption("2");
  await page.locator("#choice-action").selectOption("seed");
  await page.locator("#choice-cell").selectOption("heart");
  await page.locator("#choice-run").click();
  assert.equal(await page.locator("#choice-result").isVisible(), true);
}
async function blockWrites(page) {
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException("Full", "QuotaExceededError");
      return original.call(this, name, value);
    };
    window.restoreRewindWrites = () => { Storage.prototype.setItem = original; };
  }, WATCH_SAVE_KEY);
}

test("review and both cancellation paths preserve the live watch, journal, comparison and saved bytes", async t => {
  const { page } = await open(t);
  assert.equal(await page.locator("#watch-rewind-open").isDisabled(), true);
  await play(page); await page.locator('[data-cell="0"]').click(); await comparison(page);
  const before = await facts(page), expected = nativeFile(TURNS, "north");
  for (const cancel of ["keep", "escape"]) {
    await review(page);
    assert.match(await page.locator("#watch-rewind-summary").textContent(), /Remove tide 3: Seed at South Reach.*day 2/);
    assert.match(await page.locator("#watch-rewind-effect").textContent(), /action, tide event and journal entry/);
    assert.ok((await page.locator("#watch-rewind-effect").textContent()).includes(expected.state.cells.find(cell => cell.id === "north").name + " stays selected."));
    const previous = JSON.parse(expected.snapshots[2]);
    assert.equal(await page.locator("#watch-rewind-resources").textContent(),
      "Water: " + expected.state.freshwater + " → " + previous.freshwater + ". Seed packs: " + expected.state.seedPacks + " → " + previous.seedPacks + ".");
    for (const key of ["g", "h", "s", "r"]) await page.locator("#watch-rewind-keep").press(key);
    assert.deepEqual(await facts(page), before);
    if (cancel === "keep") await page.locator("#watch-rewind-keep").click();
    else await page.keyboard.press("Escape");
    assert.equal(await page.locator("#watch-rewind-review").isVisible(), false);
    assert.deepEqual(await facts(page), before);
    assert.equal(await page.locator("#watch-rewind-open").evaluate(el => el === document.activeElement), true);
  }
});

test("confirmation restores one whole native prefix and the next action branches from it", async t => {
  const { page } = await open(t);
  await play(page); await page.locator('[data-cell="0"]').click(); await comparison(page);
  const entries = await page.locator("#journal-entries > li").evaluateAll(els => els.slice(0, 2).map(el => el.outerHTML));
  const expected = nativeFile(TURNS.slice(0, 2), "north");
  await review(page); await confirm(page);
  assert.equal(await day(page), 2);
  assert.equal(await stored(page), expected.raw);
  assert.equal(await download(page), expected.raw);
  assert.equal(await page.locator('[data-cell="0"]').getAttribute("aria-pressed"), "true");
  assert.deepEqual(await page.locator("#journal-entries > li").evaluateAll(els => els.map(el => el.outerHTML)), entries);
  assert.equal(await page.locator("#choice-result").isVisible(), false);
  assert.deepEqual(await page.locator("#choice-tide option").evaluateAll(els => els.map(el => el.value)), ["1", "2"]);
  assert.match(await page.locator("#watch-rewind-status").textContent(), /Rewound tide 3.*saved in this browser/);
  await page.reload(); await ready(page);
  assert.equal(await stored(page), expected.raw);
  assert.equal(await page.locator("#journal-entries > li").count(), 2);
  await play(page, [["gate", "north"]]);
  assert.equal(await stored(page), nativeFile([...TURNS.slice(0, 2), ["gate", "north"]], "north").raw);
});

test("rewinding the first tide keeps the selected cell and returns focus to the status", async t => {
  const { page } = await open(t);
  await play(page, [["gate", "north"]]); await page.locator('[data-cell="2"]').click();
  await review(page); await confirm(page);
  assert.equal(await day(page), 0);
  assert.equal(await stored(page), nativeFile([], "south").raw);
  assert.equal(await page.locator("#journal-entries > li").count(), 0);
  assert.equal(await page.locator("#watch-rewind-open").isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: "Download watch report", exact: true }).isDisabled(), true);
  assert.equal(await page.locator("#watch-rewind-status").evaluate(el => el === document.activeElement), true);
  await page.reload(); await ready(page);
  assert.equal(await day(page), 0);
  assert.equal(await page.locator('[data-cell="2"]').getAttribute("aria-pressed"), "true");
});

test("a completed watch reopens its thirteenth tide and requires a new review for another rewind", async t => {
  const { page } = await open(t), turns = completeTurns();
  assert.equal(turns.length, 14);
  await adopt(page, nativeFile(turns, "north").raw);
  assert.match(await page.locator("#state-summary").textContent(), /Watch closed/);
  await review(page); await confirm(page);
  assert.equal(await stored(page), nativeFile(turns.slice(0, 13), "north").raw);
  assert.equal(await page.locator("#journal-entries > li").count(), 13);
  assert.doesNotMatch(await page.locator("#state-summary").textContent(), /Watch closed/);
  assert.equal(await page.locator("#watch-recap").isVisible(), false);
  await page.locator("#watch-rewind-confirm").evaluate(el => el.click());
  assert.equal(await day(page), 13, "a hidden old confirmation cannot remove another tide");
  await review(page); await confirm(page);
  assert.equal(await stored(page), nativeFile(turns.slice(0, 12), "north").raw);
});

test("cancel preserves a pending file preview while successful rewind retires it", async t => {
  const { page } = await open(t), imported = nativeFile(completeTurns(), "south").raw;
  await play(page);
  await choose(page, imported);
  const pending = await page.locator("#watch-file-preview").innerHTML();
  await review(page); await page.locator("#watch-rewind-keep").click();
  assert.equal(await page.locator("#watch-file-preview").isVisible(), true);
  assert.equal(await page.locator("#watch-file-preview").innerHTML(), pending);
  await page.getByRole("button", { name: "Replace current watch", exact: true }).click();
  assert.equal(await stored(page), imported, "cancel leaves the original file token usable");
  await adopt(page, nativeFile().raw);
  await choose(page, imported);
  await review(page); await confirm(page);
  assert.equal(await page.locator("#watch-file-preview").isVisible(), false);
  assert.equal(await stored(page), nativeFile(TURNS.slice(0, 2)).raw);
  await page.getByRole("button", { name: "Replace current watch", exact: true, includeHidden: true }).evaluate(el => el.click());
  assert.equal(await day(page), 2, "the retired file token cannot replace the accepted prefix");
});

test("failed saving keeps the shorter watch exportable and ordinary retry saves without another rewind", async t => {
  const { page } = await open(t);
  await play(page); const original = await stored(page);
  await blockWrites(page); await review(page); await confirm(page);
  const expected = nativeFile(TURNS.slice(0, 2));
  assert.equal(await day(page), 2);
  assert.equal(await stored(page), original);
  assert.equal(await download(page), expected.raw);
  assert.match(await page.locator("#watch-rewind-status").textContent(), /saving has not succeeded.*Download watch/);
  await page.evaluate(() => window.restoreRewindWrites());
  await page.getByRole("button", { name: "Try saving again", exact: true }).click();
  assert.equal(await stored(page), expected.raw);
  assert.equal(await page.locator("#journal-entries > li").count(), 2);
  await page.reload(); await ready(page); assert.equal(await day(page), 2);
});

test("protected and unobserved foreign saves retain their exact bytes when a local prefix is accepted", async t => {
  for (const mode of ["protected", "foreign"]) {
    const { page } = await open(t);
    const foreign = mode === "protected" ? "Unrecognized saved watch Ω" : nativeFile([["seed", "north"]], "north").raw;
    if (mode === "protected") {
      await page.evaluate(({key,raw}) => localStorage.setItem(key, raw), {key:WATCH_SAVE_KEY,raw:foreign});
      await page.reload(); await ready(page);
    }
    await play(page);
    if (mode === "foreign") await page.evaluate(({key,raw}) => localStorage.setItem(key, raw), {key:WATCH_SAVE_KEY,raw:foreign});
    await review(page); await confirm(page);
    assert.equal(await day(page), 2);
    assert.equal(await stored(page), foreign);
    assert.equal(await download(page), nativeFile(TURNS.slice(0, 2)).raw);
    assert.match(await page.locator("#watch-rewind-status").textContent(), /saving has not succeeded/);
  }
});

test("observed storage changes close an outstanding review and cannot reuse its old confirmation", async t => {
  const { page, context } = await open(t); await play(page);
  const second = await context.newPage(); await second.goto(server.url); await ready(second);
  await review(page);
  await second.locator('[data-action="gate"]').click();
  const winner = await stored(second);
  await page.locator("#watch-rewind-review").waitFor({ state: "hidden" });
  assert.match(await page.locator("#watch-rewind-status").textContent(), /changed/);
  await page.locator("#watch-rewind-confirm").evaluate(el => el.click());
  assert.equal(await day(page), 3);
  assert.equal(await stored(page), winner);
  assert.equal(await download(page), nativeFile().raw);
});

test("post-adoption display failure leaves accepted progress downloadable with truthful recovery text", async t => {
  for (const saved of [true, false]) {
    const { page } = await open(t); await play(page); await comparison(page);
    if (!saved) await blockWrites(page);
    await page.evaluate(async () => {
      const { WatchJournal } = await import("/journal.js");
      const original = WatchJournal.prototype.restore;
      WatchJournal.prototype.restore = function () {
        WatchJournal.prototype.restore = original;
        throw new Error("Receiving display failure after native adoption");
      };
    });
    await review(page); await confirm(page);
    assert.equal(await page.locator("#watch-journal").isVisible(), false);
    assert.equal(await page.locator("#choice-result").isVisible(), false);
    assert.equal(await page.locator("#watch-rewind-open").isDisabled(), true);
    assert.equal(await page.locator(".game-control").evaluateAll(els => els.every(el => el.disabled)), true);
    assert.equal(await download(page), nativeFile(TURNS.slice(0, 2)).raw);
    const status = await page.locator("#watch-rewind-status").textContent();
    assert.match(status, /Rewound tide 3.*display could not be refreshed/);
    assert.match(status, saved ? /saved in this browser.*Reload/ : /not been saved.*Download watch before reloading/);
    await page.screenshot({ path: "test-results/watch-rewind/display-failure-" + (saved ? "saved" : "unsaved") + ".png", fullPage: true });
    if (saved) { await page.reload(); await ready(page); assert.equal(await day(page), 2); }
  }
});

test("the actual offline download supports a phone review and resumes the confirmed prefix without requests", async t => {
  const { page } = await open(t);
  const output = "test-results/watch-rewind/Longwater-Fourteen-Tides.html";
  const fresh = JSON.parse(execFileSync(process.execPath, ["scripts/package.mjs", "test-results/watch-rewind/fresh.html"], {encoding:"utf8"}));
  const event = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download offline game", exact: true }).click();
  const file = await event; assert.equal(await file.failure(), null); await file.saveAs(output);
  assert.deepEqual(await readFile(output), await readFile(fresh.file));
  const context = await browser.newContext({offline:true, viewport:{width:320,height:568}, isMobile:true, hasTouch:true});
  t.after(() => context.close());
  const local = pathToFileURL(new URL("../" + output, import.meta.url).pathname).href;
  const external = [], errors = [];
  context.on("request", request => { if(request.url() !== local && !/^(data|blob):/.test(request.url())) external.push(request.url()); });
  const offline = await context.newPage();
  offline.on("pageerror", error => errors.push(error.message));
  offline.setDefaultTimeout(7000); await offline.goto(local); await ready(offline);
  await adopt(offline, nativeFile().raw);
  await offline.locator("#watch-rewind-open").tap();
  for (const selector of ["#watch-rewind-keep", "#watch-rewind-confirm"]) {
    const bounds = await offline.locator(selector).boundingBox();
    assert.ok(bounds && bounds.width >= 44 && bounds.height >= 44, selector + " has a usable touch target");
  }
  assert.equal(await offline.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await offline.screenshot({path:"test-results/watch-rewind/phone-review.png",fullPage:true});
  await offline.locator("#watch-rewind-confirm").tap();
  assert.equal(await download(offline), nativeFile(TURNS.slice(0, 2)).raw);
  await offline.reload(); await ready(offline);
  assert.equal(await day(offline), 2);
  assert.equal(await stored(offline), nativeFile(TURNS.slice(0, 2)).raw);
  assert.equal(await offline.locator("#journal-entries > li").count(), 2);
  assert.deepEqual(external, []); assert.deepEqual(errors, []);
});
