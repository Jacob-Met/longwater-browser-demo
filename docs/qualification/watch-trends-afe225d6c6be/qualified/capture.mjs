import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { chromium } from "/workspace/scratch/3e50c5ad22c5/production/longwater-composition/node_modules/playwright/index.mjs";

const root = "/dev/shm/hamon-afe225d6c6be-engine-longwater";
const source = `${root}/source`;
const output = `${root}/evidence/author-qualified`;
const { serve } = await import(pathToFileURL(`${source}/tests/server.mjs`));
const { initSync, BrowserSession } = await import(pathToFileURL(`${source}/pkg/longwater_web.js`));
initSync({ module: await readFile(`${source}/pkg/longwater_web_bg.wasm`) });
const server = await serve();
const browser = await chromium.launch({ headless: true, executablePath: "/workspace/scratch/3e50c5ad22c5/production/browser/chromium" });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [], requests = [];
page.on("pageerror", error => errors.push(error.message));
page.on("request", request => requests.push(request.url()));
const sim = new BrowserSession();
const states = [JSON.parse(sim.snapshot_json())];
const actions = [];
try {
  await page.goto(server.url);
  await page.locator("#watch-journal").waitFor({ state: "visible" });
  while (!states.at(-1).finished) {
    const state = states.at(-1);
    let index = state.cells.findIndex(cell => cell.shade < 3);
    const action = index >= 0 ? "shade" : state.freshwater > 0 ? "gate" : "seed";
    if (index < 0) index = state.day % 3;
    await page.locator(`[data-cell="${index}"]`).click();
    await page.locator(`[data-action="${action}"]`).click();
    actions.push([action, state.cells[index].id]);
    states.push(JSON.parse(sim.take_turn(action, state.cells[index].id)));
  }
  await page.locator("#trend-metric").selectOption("salinity");
  await page.locator("#trend-tide").focus();
  await page.keyboard.press("Home");
  for (let step = 0; step < 7; step++) await page.keyboard.press("ArrowRight");
  assert.equal(await page.locator("#trend-tide").inputValue(), "7");
  await page.locator("#watch-trends").screenshot({ path: `${output}/trends-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#trend-metric").selectOption("depth");
  await page.locator("#trend-chart").scrollIntoViewIfNeeded();
  const chart = await page.locator("#trend-chart").boundingBox();
  await page.mouse.click(chart.x + 5, chart.y + chart.height / 2);
  assert.equal(await page.locator("#trend-tide").inputValue(), "0");
  await page.mouse.click(chart.x + chart.width - 5, chart.y + chart.height / 2);
  assert.equal(await page.locator("#trend-tide").inputValue(), "14");
  assert.equal(await page.evaluate(() => document.activeElement.id), "trend-tide");
  await page.locator("#trend-table-details > summary").click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator("#watch-trends").screenshot({ path: `${output}/trends-phone.png` });
  const rows = await page.locator("#trend-table tbody tr").evaluateAll(rows => rows.map(row => [...row.children].map(cell => cell.textContent)));
  assert.deepEqual(rows, states.map(state => [state.day ? `Tide ${state.day}` : "Opening", ...state.cells.map(cell => String(cell.depth))]));
  assert.ok(requests.every(url => url.startsWith(server.url)));
  assert.deepEqual(errors, []);
  const captures = [];
  for (const name of ["trends-desktop.png", "trends-phone.png"]) {
    const bytes = await readFile(`${output}/${name}`);
    captures.push({ name, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  const receipt = { status: "passed", browser: browser.version(), source: "b4c3b82e + scoped trends candidate", actions, finalState: states.at(-1), opening: states[0], pointerSelection: [0, 14], phoneWidth: 390, pageErrors: errors, externalRequests: requests.filter(url => !url.startsWith(server.url)), captures };
  await writeFile(`${output}/capture-receipt.json`, JSON.stringify(receipt, null, 2) + "\n");
  console.log(JSON.stringify(receipt));
} finally {
  sim.free(); await context.close(); await browser.close(); await server.close();
}
