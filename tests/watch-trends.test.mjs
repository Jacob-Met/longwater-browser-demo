import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { initSync, BrowserSession } from "../pkg/longwater_web.js";
import { serve } from "./server.mjs";

const metrics = [
  ["depth", "Depth", "cm"], ["salinity", "Salt", "ppt"],
  ["oxygen", "Oxygen", "%"], ["biomass", "Life", "%"], ["shade", "Canopy", "/ 3"],
];
const actions = [["gate", 2], ["shade", 0], ["seed", 1], ["shade", 2], ["gate", 0], ["shade", 1]];
let browser;
let server;

before(async () => {
  initSync({ module: await readFile(new URL("../pkg/longwater_web_bg.wasm", import.meta.url)) });
  server = await serve();
  browser = await chromium.launch({ headless: true, executablePath: process.env.LONGWATER_CHROME_PATH || undefined });
});
after(async () => { await browser?.close(); await server?.close(); });

async function open(url = server.url, options = {}) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(url);
  await page.locator("#watch-journal").waitFor({ state: "visible" });
  const sim = new BrowserSession();
  const states = [JSON.parse(sim.snapshot_json())];
  return {
    context, page, states,
    async expand() {
      if (!await page.locator("#journal-details").evaluate(node => node.open)) await page.locator("#journal-details > summary").click();
    },
    async turn(action, index, keepFocus = false) {
      const previous = states.at(-1);
      const cell = page.locator(`[data-cell="${index}"]`);
      const button = page.locator(`[data-action="${action}"]`);
      if (keepFocus) { await cell.evaluate(node => node.click()); await button.evaluate(node => node.click()); }
      else { await cell.click(); await button.click(); }
      const next = JSON.parse(sim.take_turn(action, previous.cells[index].id));
      if (next.day !== previous.day) states.push(next);
      assert.equal(await page.locator("#journal-entries > li").count(), states.at(-1).day);
    },
    async close() { sim.free(); await context.close(); assert.deepEqual(errors, []); },
  };
}

async function assertTable(page, states, metric) {
  const [key, label, unit] = metrics.find(item => item[0] === metric);
  await page.locator("#trend-metric").selectOption(key);
  const table = page.locator("#trend-table");
  assert.match(await table.locator("caption").textContent(), new RegExp(`${label}.*${unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.deepEqual(await table.locator("thead th").allTextContents(), ["Tide", ...states[0].cells.map(cell => cell.name)]);
  const actual = await table.locator("tbody tr").evaluateAll(rows => rows.map(row => [...row.children].map(cell => cell.textContent)));
  assert.deepEqual(actual, states.map(state => [state.day === 0 ? "Opening" : `Tide ${state.day}`, ...state.cells.map(cell => String(cell[key]))]));
  const points = await page.locator("#trend-chart polyline[data-trend-cell]").evaluateAll(lines => lines.map(line => ({
    id: line.dataset.trendCell,
    points: line.getAttribute("points").trim().split(/\s+/).map(point => point.split(",").map(Number)),
  })));
  assert.deepEqual(points.map(line => line.id), states[0].cells.map(cell => cell.id));
  for (const line of points) {
    assert.equal(line.points.length, states.length);
    assert.ok(line.points.flat().every(Number.isFinite));
    for (let index = 1; index < line.points.length; index++) {
      assert.ok(line.points[index][0] > line.points[index - 1][0], "completed tides run left to right");
      const oldValue = states[index - 1].cells.find(cell => cell.id === line.id)[key];
      const value = states[index].cells.find(cell => cell.id === line.id)[key];
      assert.equal(Math.sign(line.points[index][1] - line.points[index - 1][1]), Math.sign(oldValue - value), "actual plot direction follows the native change");
    }
  }
}

async function assertReadout(page, state, key) {
  const values = await page.locator("#trend-values > div").evaluateAll(rows => rows.map(row => [row.querySelector("dt").textContent, row.querySelector("dd").textContent]));
  const unit = metrics.find(metric => metric[0] === key)[2];
  assert.deepEqual(values, state.cells.map(cell => [cell.name, `${cell[key]} ${unit}`]));
  assert.match(await page.locator("#trend-selected").textContent(), new RegExp(state.day === 0 ? "Opening" : `Tide ${state.day}\\b`));
  if (state.report) {
    assert.match(await page.locator("#trend-context").textContent(), new RegExp(state.report.event.name));
    assert.match(await page.locator("#trend-context").textContent(), new RegExp(state.cells.find(cell => cell.id === state.report.cell).name));
  }
}

test("opening trends expose five correctly labelled metrics without inventing a completed tide", async () => {
  const game = await open();
  try {
    await game.expand();
    assert.equal(await game.page.locator("#watch-trends").count(), 1, "the completed journal needs its trends view");
    assert.match(await game.page.locator("#trend-scope").textContent(), /No completed tides/);
    assert.equal(await game.page.locator("#trend-tide").getAttribute("max"), "0");
    for (const [key] of metrics) { await assertTable(game.page, game.states, key); await assertReadout(game.page, game.states[0], key); }
    assert.equal(await game.page.locator("#journal-entries > li").count(), 0);
  } finally { await game.close(); }
});

test("changed real WASM actions produce complete exact tables and separate cell series without changing the watch", async () => {
  const game = await open();
  try {
    for (const [action, index] of actions) await game.turn(action, index);
    await game.expand();
    const before = await game.page.evaluate(() => ({ saved: { ...localStorage }, journal: document.querySelector("#journal-entries").innerHTML, state: document.querySelector("#state-summary").textContent }));
    for (const [key] of metrics) {
      await assertTable(game.page, game.states, key);
      for (let day = 0; day < game.states.length; day++) {
        await game.page.locator("#trend-tide").evaluate((input, day) => { input.value = String(day); input.dispatchEvent(new Event("input", { bubbles: true })); }, day);
        await assertReadout(game.page, game.states[day], key);
      }
    }
    const after = await game.page.evaluate(() => ({ saved: { ...localStorage }, journal: document.querySelector("#journal-entries").innerHTML, state: document.querySelector("#state-summary").textContent }));
    assert.deepEqual(after, before, "reviewing trends does not write storage, alter journal entries, or advance the simulation");
  } finally { await game.close(); }
});

test("native keyboard controls retain earlier selection and focus while later tides arrive", async () => {
  const game = await open();
  try {
    for (const [action, index] of actions.slice(0, 3)) await game.turn(action, index);
    await game.expand();
    await game.page.locator("#trend-metric").focus();
    await game.page.keyboard.press("Tab");
    assert.equal(await game.page.evaluate(() => document.activeElement.id), "trend-tide");
    await game.page.keyboard.press("Home");
    assert.equal(await game.page.locator("#trend-tide").inputValue(), "0");
    await game.page.keyboard.press("ArrowRight");
    assert.equal(await game.page.locator("#trend-tide").inputValue(), "1");
    await game.turn(...actions[3], true);
    assert.equal(await game.page.evaluate(() => document.activeElement.id), "trend-tide");
    assert.equal(await game.page.locator("#trend-tide").inputValue(), "1");
    await game.page.keyboard.press("End");
    assert.equal(await game.page.locator("#trend-tide").inputValue(), "4");
    await game.turn(...actions[4], true);
    assert.equal(await game.page.locator("#trend-tide").inputValue(), "5");
    assert.equal(await game.page.evaluate(() => document.activeElement.id), "trend-tide");
    await assertReadout(game.page, game.states.at(-1), "biomass");
  } finally { await game.close(); }
});

test("selection and refused actions add no trend, and reset starts at the actual opening", async () => {
  const game = await open();
  try {
    for (let index = 0; index < 3; index++) await game.turn("shade", 0);
    await game.expand();
    const history = await game.page.locator("#trend-table tbody").innerHTML();
    await game.page.locator('[data-action="shade"]').evaluate(node => node.click());
    await game.page.locator('[data-cell="2"]').click();
    assert.equal(await game.page.locator("#trend-table tbody").innerHTML(), history);
    await game.page.locator("#reset-control").click();
    await game.page.getByRole("button", { name: "Start new watch", exact: true }).click();
    await game.expand();
    assert.equal(await game.page.locator("#trend-tide").inputValue(), "0");
    await assertTable(game.page, [game.states[0]], "biomass");
    await assertReadout(game.page, game.states[0], "biomass");
  } finally { await game.close(); }
});

test("clicking the chart selects the tide and leaves keyboard focus on its slider", async () => {
  const game = await open();
  try {
    for (const [action, index] of actions.slice(0, 3)) await game.turn(action, index);
    await game.expand();
    await game.page.setViewportSize({ width: 390, height: 844 });
    await game.page.locator("#trend-chart").scrollIntoViewIfNeeded();
    const chart = await game.page.locator("#trend-chart").boundingBox();
    await game.page.mouse.click(chart.x + 5, chart.y + chart.height / 2);
    assert.equal(await game.page.locator("#trend-tide").inputValue(), "0");
    assert.equal(await game.page.evaluate(() => document.activeElement.id), "trend-tide");
    await game.page.mouse.click(chart.x + chart.width - 5, chart.y + chart.height / 2);
    assert.equal(await game.page.locator("#trend-tide").inputValue(), "3");
    assert.equal(await game.page.evaluate(() => document.activeElement.id), "trend-tide");
    await game.page.keyboard.press("ArrowLeft");
    assert.equal(await game.page.locator("#trend-tide").inputValue(), "2");
    await assertReadout(game.page, game.states[2], "biomass");
  } finally { await game.close(); }
});

test("partial and complete native replay retain the opening, all completed tides and the finished watch", async () => {
  const game = await open();
  try {
    for (const [action, index] of actions) await game.turn(action, index);
    await game.page.reload(); await game.page.locator("#watch-journal").waitFor({ state: "visible" }); await game.expand();
    for (const [key] of metrics) await assertTable(game.page, game.states, key);
    while (!game.states.at(-1).finished) {
      const current = game.states.at(-1);
      const cell = current.cells.findIndex(item => item.shade < 3);
      await game.turn(cell >= 0 ? "shade" : current.freshwater > 0 ? "gate" : "seed", cell >= 0 ? cell : 1);
    }
    await game.page.reload(); await game.page.locator("#watch-journal").waitFor({ state: "visible" }); await game.expand();
    assert.equal(game.states.length, 15);
    assert.match(await game.page.locator("#trend-scope").textContent(), /14 completed tides/);
    for (const [key] of metrics) await assertTable(game.page, game.states, key);
    await game.page.setViewportSize({ width: 390, height: 844 });
    await game.page.locator("#trend-table-details > summary").click();
    assert.equal(await game.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await game.page.locator("#trend-metric").isVisible(), true);
    assert.equal(await game.page.locator("#trend-tide").isVisible(), true);
  } finally { await game.close(); }
});

test("invalid journal replay cannot replace an existing trends history", async () => {
  const game = await open();
  try {
    for (const [action, index] of actions.slice(0, 2)) await game.turn(action, index);
    const snapshots = game.states.map(state => JSON.stringify(state));
    const result = await game.page.evaluate(async snapshots => {
      const { WatchJournal } = await import("./journal.js");
      const root = document.createElement("section");
      const journal = new WatchJournal(root);
      journal.restore(snapshots);
      const before = root.innerHTML;
      try { journal.restore([snapshots[0], snapshots[2]]); return { refused: false }; }
      catch { return { refused: true, unchanged: root.innerHTML === before }; }
    }, snapshots);
    assert.deepEqual(result, { refused: true, unchanged: true });
  } finally { await game.close(); }
});

test("direct-open packaging embeds the same trends and reopens native saved readings offline", async () => {
  const dir = await mkdtemp(join(tmpdir(), "longwater-trends-package-"));
  const output = join(dir, "Longwater.html");
  await promisify(execFile)(process.execPath, ["scripts/package.mjs", output]);
  const first = await readFile(output);
  await promisify(execFile)(process.execPath, ["scripts/package.mjs", output]);
  assert.deepEqual(await readFile(output), first);
  const game = await open(pathToFileURL(output).href, { viewport: { width: 390, height: 844 } });
  const requests = [];
  game.page.on("request", request => requests.push(request.url()));
  try {
    await game.context.setOffline(true);
    for (const [action, index] of actions.slice(0, 3)) await game.turn(action, index);
    await game.page.reload(); await game.page.locator("#watch-journal").waitFor({ state: "visible" }); await game.expand();
    for (const [key] of metrics) await assertTable(game.page, game.states, key);
    assert.ok(requests.every(url => url.startsWith("file:") || url.startsWith("data:")));
    assert.equal(await game.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  } finally { await game.close(); }
});
