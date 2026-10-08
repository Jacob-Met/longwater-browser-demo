import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdir, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { serve } from "./server.mjs";
import { initSync, BrowserSession } from "../pkg/longwater_web.js";
import { WATCH_SAVE_KEY } from "../watch-save.js";

const CELLS = ["north", "heart", "south"];
const READINGS = ["depth", "salinity", "oxygen", "biomass", "shade"];
const TURNS = [["shade", "heart"], ["gate", "north"], ["seed", "south"]];
let browser;
let server;

before(async () => {
  initSync({ module: await readFile(new URL("../pkg/longwater_web_bg.wasm", import.meta.url)) });
  server = await serve();
  browser = await chromium.launch({ headless: true, executablePath: process.env.LONGWATER_CHROME_PATH || undefined });
  await mkdir("test-results/watch-choice", { recursive: true });
});
after(async () => {
  await browser?.close();
  await server?.close();
});

function history(turns) {
  const native = new BrowserSession();
  try {
    const snapshots = [native.snapshot_json()];
    for (const [action, cell] of turns) snapshots.push(native.take_turn(action, cell));
    return snapshots;
  } finally { native.free(); }
}

// This oracle executes the shipped native method directly; it imports no choice model.
function expectedChoice(snapshots, tide, action, cell) {
  const native = new BrowserSession();
  try {
    for (let index = 1; index < tide; index++) {
      const report = JSON.parse(snapshots[index]).report;
      native.take_turn(report.action, report.cell);
    }
    return {
      before: JSON.parse(snapshots[tide - 1]),
      played: JSON.parse(snapshots[tide]),
      alternative: JSON.parse(native.take_turn(action, cell)),
    };
  } finally { native.free(); }
}

async function open(options = {}, setup) {
  const context = await browser.newContext(options);
  if (setup) await context.addInitScript(setup);
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(server.url);
  await page.waitForFunction(() => /Day \d+/.test(document.querySelector("#state-summary")?.textContent));
  return { page, errors, close: () => context.close() };
}

async function day(page) {
  return Number((await page.locator("#state-summary").textContent()).match(/Day (\d+)/)?.[1]);
}

async function take(page, action, cell) {
  const before = await day(page);
  await page.locator('[data-cell="' + CELLS.indexOf(cell) + '"]').click();
  const button = page.locator('[data-action="' + action + '"]');
  assert.notEqual(await button.getAttribute("aria-disabled"), "true", "fixture uses an available native action");
  await button.click();
  assert.equal(await day(page), before + 1);
}

async function play(page, turns = TURNS) {
  for (const [action, cell] of turns) await take(page, action, cell);
}

async function facts(page) {
  return page.evaluate(key => {
    let saved;
    try { saved = localStorage.getItem(key); } catch { saved = "storage unavailable"; }
    return {
      summary: document.querySelector("#state-summary").textContent,
      readings: [...document.querySelectorAll('[id^="cell-"][id$="-readings"]')].map(node => node.textContent),
      selected: [...document.querySelectorAll("[data-cell]")].map(node => node.getAttribute("aria-pressed")),
      journal: document.querySelector("#watch-journal").innerHTML,
      saveStatus: document.querySelector("#watch-save-status").textContent,
      saved,
    };
  }, WATCH_SAVE_KEY);
}

async function requireLab(page) {
  const count = await page.locator("#watch-choice").count();
  const visible = count === 1 && await page.locator("#watch-choice").isVisible();
  if (!visible) {
    const observed = await facts(page);
    assert.equal(visible, true, "completed-tide lab must be visible; actual native watch before assertion: " + JSON.stringify(observed));
  }
  if (!await page.locator("#choice-details").evaluate(node => node.open)) {
    await page.locator("#choice-details > summary").click();
  }
}

async function compare(page, tide, action, cell) {
  await requireLab(page);
  await page.locator("#choice-tide").selectOption(String(tide));
  await page.locator("#choice-action").selectOption(action);
  await page.locator("#choice-cell").selectOption(cell);
  await page.locator("#choice-run").click();
}

async function assertComparison(page, expected, tide) {
  assert.equal(await page.locator("#choice-result").isVisible(), true);
  assert.equal(await page.locator("#choice-result").getAttribute("data-tide"), String(tide));
  const resourceRows = await page.locator(".choice-resources tbody tr").evaluateAll(rows =>
    rows.map(row => ({ key: row.dataset.resource, values: [...row.querySelectorAll("td")].map(node => node.textContent) })));
  assert.deepEqual(resourceRows, ["freshwater", "seedPacks"].map(key => ({
    key, values: [expected.before, expected.played, expected.alternative].map(state => String(state[key])),
  })), "all resource counts are exact native before/played/alternative values");
  const cellRows = await page.locator(".choice-cell").evaluateAll(cards => cards.map(card => ({
    id: card.dataset.cellId,
    name: card.querySelector("h4").textContent,
    rows: [...card.querySelectorAll("tbody tr")].map(row => ({
      key: row.dataset.reading, values: [...row.querySelectorAll("td")].map(node => node.textContent),
    })),
  })));
  assert.deepEqual(cellRows, expected.before.cells.map(cell => ({
    id: cell.id, name: cell.name,
    rows: READINGS.map(key => ({
      key, values: [cell, expected.played.cells.find(value => value.id === cell.id),
        expected.alternative.cells.find(value => value.id === cell.id)].map(value => String(value[key])),
    })),
  })), "all fifteen cell readings retain native precision and canonical cell order");
  for (const kind of ["played", "alternative"]) {
    const target = page.locator('.choice-report[data-kind="' + kind + '"]');
    const state = expected[kind];
    assert.equal(await target.locator(".choice-event").textContent(), state.report.event.name);
    assert.equal(await target.locator(".choice-event-note").textContent(), state.report.event.note);
    assert.deepEqual(await target.locator(".choice-notes > li").allTextContents(), state.report.lines,
      "the entire native report is retained, including event and dawn drift");
    if (state.finished) assert.equal(await target.locator(".choice-outcome").textContent(), "Watch outcome at this tide: " + state.outcome);
    else assert.equal(await target.locator(".choice-outcome").count(), 0);
  }
}

test("an opening watch stays playable before any historical choice is available", async () => {
  const { page, errors, close } = await open();
  try {
    assert.equal(await day(page), 0);
    assert.equal(await page.getByRole("button", { name: /Compare this choice/ }).count(), 0);
    await take(page, "shade", "heart");
    const saved = JSON.parse((await facts(page)).saved);
    assert.equal(saved.snapshot, history([["shade", "heart"]])[1]);
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("a completed historical alternative shows every native consequence without changing the active watch", async () => {
  const { page, errors, close } = await open();
  try {
    await play(page);
    const before = await facts(page);
    const snapshots = history(TURNS);
    await compare(page, 2, "seed", "heart");
    await assertComparison(page, expectedChoice(snapshots, 2, "seed", "heart"), 2);
    assert.deepEqual(await facts(page), before, "comparison does not change live readings, selected cell, journal, save status or authored save bytes");
    await page.screenshot({ path: "test-results/watch-choice/desktop-comparison.png", fullPage: true });
    await take(page, "gate", "south");
    const expected = history([...TURNS, ["gate", "south"]]);
    assert.equal(JSON.parse((await facts(page)).saved).snapshot, expected.at(-1),
      "the next real action continues the original hidden native session");
    assert.equal(await page.locator("#choice-result").isVisible(), false, "a newly accepted live tide invalidates the old comparison");
    assert.equal(await page.locator("#choice-tide").inputValue(), "4");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("recorded choices match exactly and changing controls clears a previous comparison", async () => {
  const { page, errors, close } = await open();
  try {
    await play(page);
    const snapshots = history(TURNS);
    await compare(page, 1, "shade", "heart");
    await assertComparison(page, expectedChoice(snapshots, 1, "shade", "heart"), 1);
    assert.match(await page.locator("#choice-status").textContent(), /exactly matches/);
    const prior = await facts(page);
    await page.locator("#choice-action").selectOption("seed");
    assert.equal(await page.locator("#choice-result").isVisible(), false);
    assert.equal(await page.locator("#choice-result").textContent(), "");
    assert.deepEqual(await facts(page), prior);
    await page.locator("#choice-tide").selectOption("2");
    assert.equal(await page.locator("#choice-action").inputValue(), "gate");
    assert.equal(await page.locator("#choice-cell").inputValue(), "north");
    assert.deepEqual(await page.locator("#choice-tide option").evaluateAll(nodes => nodes.map(node => node.value)), ["1", "2", "3"]);
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("an unavailable historical choice refuses cleanly while an earlier available choice still works", async () => {
  const { page, errors, close } = await open();
  try {
    const turns = [["shade", "heart"], ["shade", "heart"], ["shade", "heart"], ["seed", "south"]];
    await play(page, turns);
    const before = await facts(page);
    const snapshots = history(turns);
    assert.equal(JSON.parse(snapshots[3]).cells[1].shade, 3, "fixture actually reaches the native canopy limit");
    await compare(page, 4, "shade", "heart");
    assert.equal(await page.locator("#choice-result").isVisible(), false);
    assert.match(await page.locator("#choice-status").textContent(), /could not be compared/i);
    assert.deepEqual(await facts(page), before, "native refusal spends no live tide or saved resource");
    await compare(page, 1, "shade", "heart");
    await assertComparison(page, expectedChoice(snapshots, 1, "shade", "heart"), 1);
    assert.deepEqual(await facts(page), before, "historical admission uses that tide's canopy, not the current maximum");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("panel keyboard choices remain separate from game shortcuts and phone readings fit", async () => {
  const { page, errors, close } = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    await play(page);
    await compare(page, 2, "seed", "north");
    const before = await facts(page);
    await page.locator("#choice-cell").focus();
    await page.keyboard.press("r");
    await page.keyboard.press("g");
    await page.keyboard.press("1");
    assert.deepEqual(await facts(page), before, "letters and digits inside a select do not reset or play the live watch");
    await compare(page, 2, "seed", "north");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    for (const id of ["choice-tide", "choice-cell", "choice-action", "choice-run"]) {
      const box = await page.locator("#" + id).boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44, id + " retains a touch-sized control");
    }
    await page.screenshot({ path: "test-results/watch-choice/phone-comparison.png", fullPage: true });
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("reset invalidates a comparison even when canvas geometry temporarily disappears", async () => {
  const { page, errors, close } = await open();
  try {
    await play(page);
    await compare(page, 2, "seed", "heart");
    const retained = await facts(page);
    const comparison = await page.locator("#watch-choice").evaluate(root => ({
      html: root.innerHTML,
      choices: [...root.querySelectorAll("select")].map(node => [node.id, node.value]),
    }));
    await page.locator("#reset-control").click();
    assert.equal(await page.locator("#new-watch-review").isVisible(), true);
    await page.locator("#keep-watch").click();
    assert.deepEqual(await facts(page), retained, "Keep retains the exact live watch and saved bytes");
    assert.deepEqual(await page.locator("#watch-choice").evaluate(root => ({
      html: root.innerHTML,
      choices: [...root.querySelectorAll("select")].map(node => [node.id, node.value]),
    })), comparison, "Keep retains the entire current comparison and its selected alternative");
    await page.locator("#reset-control").press("r");
    assert.equal(await page.locator("#new-watch-review").isVisible(), true);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#new-watch-review").isVisible(), false);
    assert.deepEqual(await facts(page), retained, "Escape retains the exact live watch and saved bytes");
    assert.deepEqual(await page.locator("#watch-choice").evaluate(root => ({
      html: root.innerHTML,
      choices: [...root.querySelectorAll("select")].map(node => [node.id, node.value]),
    })), comparison, "Escape retains the entire current comparison and its selected alternative");
    await page.evaluate(() => {
      document.querySelector("#playfield").style.display = "none";
      window.dispatchEvent(new Event("resize"));
    });
    await page.locator("#reset-control").evaluate(node => node.click());
    await page.locator("#start-new-watch").click();
    assert.equal(await page.locator("#watch-choice").isVisible(), false);
    assert.equal(await page.locator("#choice-result").textContent(), "", "reset removes the retained comparison while the playfield is hidden");
    assert.equal(JSON.parse((await facts(page)).saved).turns.length, 0);
    await page.evaluate(() => {
      document.querySelector("#playfield").style.removeProperty("display");
      window.dispatchEvent(new Event("resize"));
    });
    assert.equal(await day(page), 0);
    await take(page, "seed", "north");
    await compare(page, 1, "shade", "south");
    await assertComparison(page, expectedChoice(history([["seed", "north"]]), 1, "shade", "south"), 1);
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("comparison reads native history when browser saving is unavailable", async () => {
  const { page, errors, close } = await open({}, () => {
    window.__choiceDeniedStorage = 0;
    Object.defineProperty(window, "localStorage", { configurable: true, get() {
      window.__choiceDeniedStorage++;
      throw new DOMException("Authored receiving storage boundary", "SecurityError");
    } });
  });
  try {
    await play(page);
    const before = await facts(page);
    const deniedBefore = await page.evaluate(() => window.__choiceDeniedStorage);
    await compare(page, 2, "shade", "south");
    await assertComparison(page, expectedChoice(history(TURNS), 2, "shade", "south"), 2);
    assert.equal(await page.evaluate(() => window.__choiceDeniedStorage), deniedBefore,
      "native history comparison does not retry unavailable storage");
    assert.deepEqual(await facts(page), before);
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("a closed watch can compare its final native tide without reopening the live watch", async () => {
  const { page, errors, close } = await open();
  const native = new BrowserSession();
  try {
    const snapshots = [native.snapshot_json()];
    while (!JSON.parse(snapshots.at(-1)).finished) {
      const state = JSON.parse(snapshots.at(-1));
      const cell = state.cells.find(value => value.shade < 3) ?? state.cells[0];
      const action = cell.shade < 3 ? "shade" : state.freshwater > 0 ? "gate" : "seed";
      await take(page, action, cell.id);
      snapshots.push(native.take_turn(action, cell.id));
    }
    const final = JSON.parse(snapshots.at(-1));
    assert.equal(final.day, 14);
    const before = await facts(page);
    await compare(page, 14, final.report.action, final.report.cell);
    await assertComparison(page, expectedChoice(snapshots, 14, final.report.action, final.report.cell), 14);
    assert.deepEqual(await facts(page), before);
    assert.match(before.summary, /watch closed/i);
    assert.deepEqual(errors, []);
  } finally { native.free(); await close(); }
});

test("the directly opened packaged HTML contains the same isolated native comparison", async () => {
  const packaged = JSON.parse(execFileSync(process.execPath,
    ["scripts/package.mjs", "test-results/watch-choice/Longwater-choice.html"], { encoding: "utf8" }));
  const context = await browser.newContext({ offline: true });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  const requests = [];
  const url = pathToFileURL(packaged.file).href;
  page.on("pageerror", error => errors.push(error.message));
  context.on("request", request => {
    if (request.url() !== url && !request.url().startsWith("data:")) requests.push(request.url());
  });
  try {
    await page.goto(url);
    await page.waitForFunction(() => /Day \d+/.test(document.querySelector("#state-summary")?.textContent));
    await play(page);
    const before = await facts(page);
    await compare(page, 2, "seed", "south");
    await assertComparison(page, expectedChoice(history(TURNS), 2, "seed", "south"), 2);
    assert.deepEqual(await facts(page), before);
    await page.screenshot({ path: "test-results/watch-choice/offline-comparison.png", fullPage: true });
    await page.reload();
    await page.waitForFunction(() => /Day 3/.test(document.querySelector("#state-summary")?.textContent));
    await compare(page, 1, "gate", "north");
    await assertComparison(page, expectedChoice(history(TURNS), 1, "gate", "north"), 1);
    assert.equal((await facts(page)).saved, before.saved);
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, [], "the actual standalone copy needs no network or neighboring source files");
  } finally { await context.close(); }
});
