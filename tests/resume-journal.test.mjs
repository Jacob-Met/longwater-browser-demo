import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { initSync, BrowserSession } from "../pkg/longwater_web.js";
import { serve } from "./server.mjs";

const key = "longwater.watch.v1";
const output = process.env.LONGWATER_COMPOSITION_OUTPUT || "test-results/resume-journal";
let browser;
let server;
const receipts = [];
const turns = [[2,"gate"],[0,"seed"],[1,"shade"],[2,"seed"],[0,"gate"],[1,"seed"],[2,"shade"],[0,"shade"],[1,"gate"],[2,"gate"],[0,"seed"],[1,"shade"],[2,"seed"],[0,"gate"]];

before(async () => {
  initSync({ module: await readFile(new URL("../pkg/longwater_web_bg.wasm", import.meta.url)) });
  await mkdir(output, { recursive: true });
  server = await serve();
  browser = await chromium.launch({ headless: true, executablePath: process.env.LONGWATER_CHROME_PATH || undefined });
});
after(async () => {
  await writeFile(`${output}/receipts.json`, JSON.stringify({ browser: browser?.version(), receipts }, null, 2) + "\n");
  await browser?.close();
  await server?.close();
});

async function ready(page) {
  await page.goto(server.url);
  await page.waitForFunction(() => document.querySelector("#live")?.textContent !== "Loading Longwater…");
}
async function reload(page) {
  await page.reload();
  await page.waitForFunction(() => document.querySelector("#live")?.textContent !== "Loading Longwater…");
}
async function act(page, native, states, index, action) {
  await page.locator(`[data-cell="${index}"]`).click();
  await page.locator(`[data-action="${action}"]`).click();
  const next = JSON.parse(native.take_turn(action, states.at(-1).cells[index].id));
  states.push(next);
  assert.match(await page.locator("#state-summary").textContent(), new RegExp(`Day ${next.day} of 14`));
}
async function checkJournal(page, states) {
  assert.equal(await page.locator("#journal-entries > li").count(), states.length - 1, "every native tide survives closing and reopening the page");
  for (let i = 1; i < states.length; i++) {
    const before = states[i - 1], after = states[i];
    const entry = page.locator(`[data-tide="${i}"]`);
    assert.equal(await entry.count(), 1, `exactly one journal entry for native tide ${i}`);
    assert.deepEqual(await entry.locator(".journal-notes > li").allTextContents(), after.report.lines);
    assert.equal(await entry.locator(".journal-event-note").textContent(), after.report.event.note);
    assert.equal(await entry.locator(".journal-resources").textContent(), `Freshwater: ${before.freshwater} → ${after.freshwater}. Seed packs: ${before.seedPacks} → ${after.seedPacks}.`);
    for (let c = 0; c < after.cells.length; c++) {
      const old = before.cells[c], cell = after.cells[c];
      assert.deepEqual(await entry.locator(`[data-cell-id="${cell.id}"] dd`).allTextContents(), [
        `${old.depth} → ${cell.depth} cm`, `${old.salinity} → ${cell.salinity} ppt`,
        `${old.oxygen} → ${cell.oxygen} %`, `${old.biomass} → ${cell.biomass} %`, `${old.shade} → ${cell.shade} / 3`,
      ]);
    }
  }
}

test("a resumed watch reconstructs every earlier native report before accepting the next tide", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  let page = await context.newPage();
  const native = new BrowserSession();
  const states = [JSON.parse(native.snapshot_json())];
  const errors = [];
  try {
    page.on("pageerror", e => errors.push(e.message));
    await ready(page);
    for (const [cell, action] of turns.slice(0, 6)) await act(page, native, states, cell, action);
    await checkJournal(page, states);
    const saved = await page.evaluate(key => localStorage.getItem(key), key);
    await page.close();
    page = await context.newPage();
    page.on("pageerror", e => errors.push(e.message));
    await ready(page);
    assert.match(await page.locator("#watch-save-status").textContent(), /Resumed.*day 6/);
    assert.equal(await page.locator('[data-cell="1"]').getAttribute("aria-pressed"), "true");
    await checkJournal(page, states);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), key), saved, "reconstructing the journal never rewrites the save");
    await act(page, native, states, ...turns[6]);
    await checkJournal(page, states);
    await page.locator("#journal-details > summary").click();
    await page.locator('[data-tide="1"] summary').click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: `${output}/resumed-phone.png`, fullPage: true });
    assert.deepEqual(errors, []);
    receipts.push({ case: "resume-next-turn", native_states: states, preserved_save_before_next_turn: true });
  } finally { native.free(); await context.close(); }
});

test("a completed saved watch retains fourteen reports and the actual opening-to-final recap", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const native = new BrowserSession();
  const states = [JSON.parse(native.snapshot_json())];
  try {
    await ready(page);
    for (const [cell, action] of turns) await act(page, native, states, cell, action);
    await reload(page);
    await checkJournal(page, states);
    const recap = page.locator("#watch-recap");
    assert.equal(await recap.isVisible(), true);
    assert.equal(await page.locator("#journal-count").textContent(), "14 of 14 tides · Watch closed");
    const final = states.at(-1), initial = states[0];
    for (let c = 0; c < final.cells.length; c++) {
      const old = initial.cells[c], cell = final.cells[c];
      const facts = await recap.locator(`[data-cell-id="${cell.id}"] dd`).allTextContents();
      assert.ok(facts.includes(`${old.biomass} → ${cell.biomass} %`));
      assert.ok(facts.includes(`${old.depth} → ${cell.depth} cm`));
    }
    await page.locator("#reset-control").click();
    await page.getByRole("button", { name: "Start new watch", exact: true }).click();
    assert.equal(await page.locator("#journal-entries > li").count(), 0);
    assert.equal(await recap.isVisible(), false);
    await reload(page);
    assert.equal(await page.locator("#journal-entries > li").count(), 0);
    assert.match(await page.locator("#state-summary").textContent(), /Day 0 of 14/);
    receipts.push({ case: "completed-watch-reset", reports: 14, opening_state: initial, final_state: final });
  } finally { native.free(); await context.close(); }
});

test("failed saving keeps current reports and a successful explicit retry makes the whole journal resumable", async () => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === "longwater.watch.v1" && window.rejectWatchWrites) throw new DOMException("receiving quota failure", "QuotaExceededError");
      return set.call(this, key, value);
    };
  });
  const page = await context.newPage();
  const native = new BrowserSession();
  const states = [JSON.parse(native.snapshot_json())];
  try {
    await ready(page);
    for (const [cell, action] of turns.slice(0, 2)) await act(page, native, states, cell, action);
    const saved = await page.evaluate(key => localStorage.getItem(key), key);
    await page.evaluate(() => { window.rejectWatchWrites = true; });
    await act(page, native, states, ...turns[2]);
    await checkJournal(page, states);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), key), saved);
    assert.match(await page.locator("#watch-save-status").textContent(), /could not be saved/);
    await page.evaluate(() => { window.rejectWatchWrites = false; });
    await page.locator("#watch-save-retry").click();
    await reload(page);
    await checkJournal(page, states);
    receipts.push({ case: "failed-write-retry", reports_preserved: 3, old_save_unchanged_during_failure: true });
  } finally { native.free(); await context.close(); }
});

test("a save that disagrees with real replay is protected and cannot fabricate a journal", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const native = new BrowserSession();
  const states = [JSON.parse(native.snapshot_json())];
  try {
    await ready(page);
    await act(page, native, states, ...turns[0]);
    const corrupt = await page.evaluate(key => {
      const value = JSON.parse(localStorage.getItem(key));
      const snapshot = JSON.parse(value.snapshot);
      snapshot.cells[0].biomass = 100;
      value.snapshot = JSON.stringify(snapshot);
      const raw = JSON.stringify(value);
      localStorage.setItem(key, raw);
      return raw;
    }, key);
    await reload(page);
    assert.match(await page.locator("#watch-save-status").textContent(), /could not be resumed.*kept/);
    assert.match(await page.locator("#state-summary").textContent(), /Day 0 of 14/);
    assert.equal(await page.locator("#journal-entries > li").count(), 0);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), key), corrupt);
    await page.locator("#reset-control").click();
    await page.getByRole("button", { name: "Start new watch", exact: true }).click();
    assert.notEqual(await page.evaluate(key => localStorage.getItem(key), key), corrupt);
    receipts.push({ case: "corrupt-native-snapshot", preserved_until_explicit_reset: true, fabricated_reports: 0 });
  } finally { native.free(); await context.close(); }
});

test("another tab's saved branch stays authoritative while the local journal can continue unsaved", async () => {
  const context = await browser.newContext();
  const a = await context.newPage();
  const b = await context.newPage();
  const native = new BrowserSession();
  const states = [JSON.parse(native.snapshot_json())];
  try {
    await ready(a);
    for (const [cell, action] of turns.slice(0, 2)) await act(a, native, states, cell, action);
    await ready(b);
    await act(b, native, states, ...turns[2]);
    await a.waitForFunction(() => document.querySelector("#watch-save-status").textContent.includes("another tab"));
    const savedByB = await b.evaluate(key => localStorage.getItem(key), key);
    await a.locator('[data-cell="2"]').click();
    await a.locator('[data-action="shade"]').click();
    assert.equal(await a.locator("#journal-entries > li").count(), 3, "the current unsaved watch keeps its actual local reports");
    assert.equal(await b.evaluate(key => localStorage.getItem(key), key), savedByB, "local action does not overwrite the other tab");
    await reload(a);
    await checkJournal(a, states);
    assert.match(await a.locator('[data-tide="3"] .journal-choice').textContent(), /Heart Pool/);
    receipts.push({ case: "two-tab-history", saved_branch_preserved: true, resumed_tide_3_cell: "heart" });
  } finally { native.free(); await context.close(); }
});
