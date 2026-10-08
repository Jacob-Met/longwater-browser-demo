import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { serve } from "./server.mjs";
import { initSync, BrowserSession } from "../pkg/longwater_web.js";
import { WATCH_SAVE_KEY } from "../watch-save.js";

let browser;
let server;

before(async () => {
  initSync({ module: await readFile(new URL("../pkg/longwater_web_bg.wasm", import.meta.url)) });
  server = await serve();
  browser = await chromium.launch({ headless: true, executablePath: process.env.LONGWATER_CHROME_PATH || undefined });
});

after(async () => {
  await browser?.close();
  await server?.close();
});

async function liveView(page) {
  return page.evaluate(() => ({
    summary: document.querySelector("#state-summary").textContent,
    selected: [...document.querySelectorAll("#playfield [data-cell]")].map(e => e.getAttribute("aria-pressed")),
    readings: [0, 1, 2].map(i => document.querySelector("#cell-" + i + "-readings").textContent),
    event: document.querySelector("#event-notes").textContent,
    report: [...document.querySelectorAll("#report-lines li")].map(e => e.textContent),
    journal: document.querySelector("#watch-journal").innerHTML,
    save_status: document.querySelector("#watch-save-status").textContent,
    storage: Object.fromEntries(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])),
  }));
}
async function choiceView(page) {
  return page.evaluate(() => ({
    root_hidden: document.querySelector("#watch-choice").hidden,
    panel: document.querySelector("#watch-choice").innerHTML,
    details_open: document.querySelector("#choice-details").open,
    tide: document.querySelector("#choice-tide").value,
    action: document.querySelector("#choice-action").value,
    cell: document.querySelector("#choice-cell").value,
    result_hidden: document.querySelector("#choice-result").hidden,
    result_tide: document.querySelector("#choice-result").dataset.tide,
  }));
}
async function assertComparison(page, before, played, alternative) {
  for (const key of ["freshwater", "seedPacks"]) {
    assert.deepEqual(await page.locator('#choice-result [data-resource="' + key + '"] td').allTextContents(),
      [before[key], played[key], alternative[key]].map(String), "complete resource columns: " + key);
  }
  for (const original of before.cells) {
    const actual = played.cells.find(c => c.id === original.id);
    const other = alternative.cells.find(c => c.id === original.id);
    for (const key of ["depth", "salinity", "oxygen", "biomass", "shade"]) {
      const selector = '#choice-result [data-cell-id="' + original.id + '"] [data-reading="' + key + '"] td';
      assert.deepEqual(await page.locator(selector).allTextContents(),
        [original[key], actual[key], other[key]].map(String), original.id + "/" + key + " native columns");
    }
  }
  for (const [kind, state] of [["played", played], ["alternative", alternative]]) {
    const root = '#choice-result [data-kind="' + kind + '"]';
    assert.deepEqual(await page.locator(root + " .choice-notes li").allTextContents(), state.report.lines);
    assert.equal(await page.locator(root + " .choice-event").textContent(), state.report.event.name);
    assert.equal(await page.locator(root + " .choice-event-note").textContent(), state.report.event.note);
  }
}

test("practice preserves a populated historical comparison and later choices still match the native replay", async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const control = new BrowserSession();
  const alternativeControl = new BrowserSession();
  try {
    // Build expected state only through the shipped native API, not the historical-choice model.
    const turns = [
      { action: "gate", cell: "heart", index: 1 },
      { action: "seed", cell: "south", index: 2 },
      { action: "shade", cell: "north", index: 0 },
    ];
    const history = [control.snapshot_json()];
    for (const turn of turns) history.push(control.take_turn(turn.action, turn.cell));
    assert.equal(alternativeControl.take_turn("gate", "heart"), history[1]);
    const alternative = JSON.parse(alternativeControl.take_turn("gate", "north"));

    await context.addInitScript(() => {
      window.__practiceChoiceSaveWrites = [];
      const originalSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (this === window.localStorage) window.__practiceChoiceSaveWrites.push(String(key));
        return Reflect.apply(originalSet, this, [key, value]);
      };
    });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(server.url);
    await page.waitForFunction(() => !document.querySelector("#practice-open")?.disabled);
    assert.equal(await page.locator("#startup-error").isVisible(), false);

    for (const turn of turns) {
      await page.locator('#playfield [data-cell="' + turn.index + '"]').click();
      await page.locator('#playfield [data-action="' + turn.action + '"]').click();
    }
    const live = await liveView(page);
    assert.equal(JSON.parse(live.storage[WATCH_SAVE_KEY]).snapshot, history[3]);
    assert.equal(await page.locator("#journal-entries > li").count(), 3);

    await page.locator("#choice-details > summary").click();
    await page.locator("#choice-tide").selectOption("1");
    await page.locator("#choice-cell").selectOption("south");
    await page.locator("#choice-action").selectOption("shade");
    await page.locator("#choice-run").press("Enter");
    assert.equal(await page.locator("#choice-result").evaluate(node => node.hidden), false);
    assert.equal(await page.locator("#choice-result").getAttribute("data-tide"), "1");
    assert.match(await page.locator(".choice-alternative-label").textContent(), /Shade.*South Reach/);
    assert.match(await page.locator("#choice-status").textContent(), /Historical comparison ready/);
    assert.deepEqual(await liveView(page), live);
    const historical = await choiceView(page);
    const writesBefore = await page.evaluate(() => window.__practiceChoiceSaveWrites.length);

    await page.locator("#practice-open").click();
    assert.match(await page.locator("#practice-summary").textContent(), /Practice tide 0 \/ 14/);
    await page.locator('[data-practice-cell="2"]').click();
    await page.locator('[data-practice-action="gate"]').click();
    await page.locator('[data-practice-cell="1"]').click();
    await page.locator('[data-practice-action="seed"]').press("Enter");
    assert.match(await page.locator("#practice-summary").textContent(), /Practice tide 2 \/ 14/);
    assert.deepEqual(await choiceView(page), historical, "the populated historical result remains exact behind practice");
    assert.deepEqual(await liveView(page), live, "practice preserves the live watch, selected cell, journal and saved bytes");
    assert.equal(await page.evaluate(() => window.__practiceChoiceSaveWrites.length), writesBefore);

    await page.locator("[data-practice-close]").click();
    assert.equal(await page.locator("#practice-watch").evaluate(node => node.open), false);
    assert.equal(await page.locator("#practice-open").evaluate(node => node === document.activeElement), true);
    assert.deepEqual(await choiceView(page), historical, "closing practice retains the historical form and result");
    assert.deepEqual(await liveView(page), live);

    // A different historical request after practice also checks that the native sessions remain usable.
    await page.locator("#choice-tide").selectOption("2");
    await page.locator("#choice-cell").selectOption("north");
    await page.locator("#choice-action").selectOption("gate");
    await page.locator("#choice-run").press("Enter");
    assert.equal(await page.locator("#choice-result").getAttribute("data-tide"), "2");
    assert.match(await page.locator(".choice-alternative-label").textContent(), /Gate.*North Bank/);
    assert.match(await page.locator("#choice-status").textContent(), /Historical comparison ready/);
    await assertComparison(page, JSON.parse(history[1]), JSON.parse(history[2]), alternative);
    assert.equal(await page.locator("#choice-result h3").evaluate(node => node === document.activeElement), true);
    assert.deepEqual(await liveView(page), live);
    assert.equal(await page.evaluate(() => window.__practiceChoiceSaveWrites.length), writesBefore);
    assert.deepEqual(errors, []);
  } finally {
    control.free();
    alternativeControl.free();
    await context.close();
  }
});
