import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { initSync, BrowserSession } from "../pkg/longwater_web.js";
import { serve } from "./server.mjs";

let browser;
let server;

before(async () => {
  initSync({ module: await readFile(new URL("../pkg/longwater_web_bg.wasm", import.meta.url)) });
  server = await serve();
  browser = await chromium.launch({ headless: true, executablePath: process.env.LONGWATER_CHROME_PATH || undefined });
  await mkdir("test-results", { recursive: true });
});

after(async () => {
  await browser?.close();
  await server?.close();
});

async function open(options = {}) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(server.url);
  await page.locator("#watch-journal").waitFor({ state: "visible" });
  const sim = new BrowserSession();
  let state = JSON.parse(sim.snapshot_json());
  return {
    page,
    initial: state,
    async turn(action, index) {
      const previous = state;
      await page.locator(`[data-cell="${index}"]`).click();
      await page.locator(`[data-action="${action}"]`).click();
      state = JSON.parse(sim.take_turn(action, previous.cells[index].id));
      assert.equal(await page.locator("#journal-entries > li").count(), state.day);
      return { before: previous, after: state };
    },
    async close() {
      sim.free();
      await context.close();
      assert.deepEqual(errors, [], "journal interactions have no uncaught browser errors");
    },
  };
}

async function assertCells(container, before, after) {
  const expectedUnits = { depth: "cm", salinity: "ppt", oxygen: "%", biomass: "%", shade: "/ 3" };
  for (const cell of after.cells) {
    const old = before.cells.find(item => item.id === cell.id);
    const card = container.locator(`[data-cell-id="${cell.id}"]`);
    assert.equal(await card.locator("h4").textContent(), cell.name);
    const values = await card.locator("dd").allTextContents();
    for (const [key, unit] of Object.entries(expectedUnits)) {
      assert.ok(values.includes(`${old[key]} → ${cell[key]} ${unit}`), `${cell.id}.${key} matches the native before/after snapshots`);
    }
  }
}

test("the journal preserves complete real WASM reports and all three cells across later choices", async () => {
  const game = await open();
  const { page } = game;
  try {
    assert.equal(await page.locator("#journal-count").textContent(), "No tides yet");
    await page.locator("#journal-details > summary").click();
    assert.equal(await page.locator(".journal-empty").isVisible(), true);
    const first = await game.turn("gate", 0);
    const firstEntry = page.locator('[data-tide="1"]');
    await firstEntry.locator("summary").click();
    const recorded = await firstEntry.textContent();
    assert.match(recorded, /Tide 1 · Gate · North Bank/);
    assert.deepEqual(await firstEntry.locator(".journal-notes > li").allTextContents(), first.after.report.lines);
    assert.equal(await firstEntry.locator(".journal-event").textContent(), first.after.report.event.name);
    assert.equal(await firstEntry.locator(".journal-event-note").textContent(), first.after.report.event.note);
    assert.equal(await firstEntry.locator(".journal-resources").textContent(), "Freshwater: 5 → 4. Seed packs: 5 → 5.");
    await assertCells(firstEntry, first.before, first.after);

    const second = await game.turn("shade", 1);
    const secondEntry = page.locator('[data-tide="2"]');
    assert.deepEqual(await secondEntry.locator(".journal-notes > li").allTextContents(), second.after.report.lines);
    await assertCells(secondEntry, second.before, second.after);
    await page.locator('[data-cell="2"]').click();
    await page.setViewportSize({ width: 700, height: 800 });
    assert.equal(await page.locator("#journal-entries > li").count(), 2, "selection and resizing do not manufacture tides");
    assert.equal(await firstEntry.textContent(), recorded, "later turns do not overwrite earlier evidence");
    assert.equal(await firstEntry.locator("details").getAttribute("open"), "", "reading an older tide stays open across updates");
    await page.locator("#watch-journal").screenshot({ path: "test-results/journal-desktop.png" });
  } finally { await game.close(); }
});

test("unavailable choices create no journal entry and journal keyboard reading spends no tide", async () => {
  const game = await open();
  const { page } = game;
  try {
    await game.turn("shade", 0);
    await game.turn("shade", 0);
    await game.turn("shade", 0);
    await page.locator('[data-action="shade"]').evaluate(button => button.click());
    assert.equal(await page.locator("#journal-entries > li").count(), 3);
    assert.match(await page.locator("#live").textContent(), /canopy/);
    const toggle = page.locator("#journal-details > summary");
    await toggle.focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.locator("#journal-details").getAttribute("open"), "");
    const old = page.locator("#state-summary");
    const summary = await old.textContent();
    for (const key of ["g", "s", "r", "1", "ArrowLeft"]) await page.keyboard.press(key);
    assert.equal(await old.textContent(), summary, "game shortcuts do not run while reading the journal");
    assert.equal(await page.locator("#journal-entries > li").count(), 3);
  } finally { await game.close(); }
});

test("all fourteen native tides remain reviewable with an exact final recap, then reset starts a fresh journal", async () => {
  const game = await open();
  const { page } = game;
  try {
    let last;
    const expectedReports = [];
    for (let cell = 0; cell < 3; cell++) {
      for (let canopy = 0; canopy < 3; canopy++) {
        last = await game.turn("shade", cell);
        expectedReports.push(last.after.report);
      }
    }
    for (let water = 0; water < 5; water++) {
      last = await game.turn("gate", 0);
      expectedReports.push(last.after.report);
    }
    assert.equal(last.after.finished, true);
    assert.equal(await page.locator("#journal-count").textContent(), "14 of 14 tides · Watch closed");
    assert.equal(await page.locator("#journal-details").getAttribute("open"), "");
    const recap = page.getByRole("region", { name: "Completed watch review" });
    assert.equal(await recap.isVisible(), true);
    assert.equal(await recap.locator("h3").textContent(), `Watch closed · ${last.after.outcome}`);
    await assertCells(recap, game.initial, last.after);
    for (const report of expectedReports) {
      const entry = page.locator(`[data-tide="${report.day}"]`);
      assert.deepEqual(await entry.locator(".journal-notes > li").allTextContents(), report.lines);
    }
    await page.locator('[data-action="gate"]').evaluate(button => button.click());
    assert.equal(await page.locator("#journal-entries > li").count(), 14, "a closed watch cannot append another tide");
    await page.locator("#watch-journal").screenshot({ path: "test-results/journal-complete.png" });
    await page.locator("#reset-control").click();
    assert.equal(await page.locator("#journal-entries > li").count(), 0);
    assert.equal(await recap.isVisible(), false);
    assert.equal(await page.locator("#journal-count").textContent(), "No tides yet");
    await page.locator('[data-action="seed"]').click();
    assert.equal(await page.locator("#journal-entries > li").count(), 1);
    assert.match(await page.locator('[data-tide="1"] .journal-choice').textContent(), /Seed · Heart Pool/);
  } finally { await game.close(); }
});

test("phone readers can expand every note and cell without horizontal overflow", async () => {
  const game = await open({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const { page } = game;
  try {
    const first = await game.turn("gate", 0);
    await page.locator("#journal-details > summary").tap();
    await page.locator('[data-tide="1"] summary').tap();
    for (const line of first.after.report.lines) {
      assert.equal(await page.locator(".journal-notes").getByText(line, { exact: true }).isVisible(), true);
    }
    for (const card of await page.locator('[data-tide="1"] .journal-cell').all()) assert.equal(await card.isVisible(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const bounds = await page.locator('[data-tide="1"] summary').boundingBox();
    assert.ok(bounds.width >= 44 && bounds.height >= 44);
    await page.locator("#watch-journal").screenshot({ path: "test-results/journal-phone.png" });
  } finally { await game.close(); }
});

test("a failed simulation startup offers no fabricated watch history", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.route("**/*.wasm", route => route.abort());
    await page.goto(server.url);
    await page.waitForFunction(() => document.querySelector("#live")?.textContent.includes("could not start"));
    assert.equal(await page.locator("#watch-journal").isVisible(), false);
    assert.equal(await page.locator("#journal-entries > li").count(), 0);
  } finally { await context.close(); }
});
