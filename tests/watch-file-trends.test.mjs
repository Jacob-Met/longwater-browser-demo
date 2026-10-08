import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, mkdir } from "node:fs/promises";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { serve } from "./server.mjs";
import { initSync, BrowserSession } from "../pkg/longwater_web.js";
import { SIMULATION_REVISION, WATCH_SAVE_KEY } from "../watch-save.js";

initSync({ module: await readFile(new URL("../pkg/longwater_web_bg.wasm", import.meta.url)) });
const metrics = ["depth", "salinity", "oxygen", "biomass", "shade"];

function watchFile(complete) {
  const session = new BrowserSession();
  const states = [JSON.parse(session.snapshot_json())], turns = [];
  const take = (action, cell) => {
    states.push(JSON.parse(session.take_turn(action, cell)));
    turns.push({ action, cell });
  };
  try {
    if (complete) {
      while (!states.at(-1).finished) {
        const state = states.at(-1);
        const index = state.cells.findIndex(cell => cell.shade < 3);
        take(index >= 0 ? "shade" : state.freshwater > 0 ? "gate" : "seed", state.cells[index < 0 ? 0 : index].id);
      }
    } else {
      take("shade", "heart");
      take("gate", "north");
      take("seed", "south");
    }
    return {
      states,
      raw: JSON.stringify({ version: 1, simulation: SIMULATION_REVISION, turns, selected: "south", snapshot: session.snapshot_json() }),
    };
  } finally { session.free(); }
}

test("watch-file replacement rebuilds every native trend value online and in the current offline download", async () => {
  const server = await serve();
  await mkdir(new URL("../test-results/", import.meta.url), { recursive: true });
  const artifact = JSON.parse(execFileSync(process.execPath, ["scripts/package.mjs", "test-results/watch-file-trends.html"], { encoding: "utf8" }));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.LONGWATER_CHROME_PATH || undefined });
  const errors = [], extraRequests = [];
  let compared = 0;
  try {
    for (const offline of [false, true]) {
      const context = await browser.newContext({ offline, viewport: { width: 1280, height: 1000 } });
      const url = offline ? pathToFileURL(artifact.file).href : server.url;
      if (offline) context.on("request", request => {
        if (request.url() !== url && !/^(data|blob):/.test(request.url())) extraRequests.push(request.url());
      });
      try {
        const page = await context.newPage();
        page.setDefaultTimeout(7000);
        page.on("pageerror", error => errors.push(error.message));
        await page.goto(url);
        await page.waitForFunction(() => !document.querySelector("#watch-file-open")?.disabled);
        for (const complete of [false, true]) {
          const incoming = watchFile(complete);
          const priorRows = await page.locator("#trend-table tbody tr").count();
          const priorRaw = await page.evaluate(key => localStorage.getItem(key), WATCH_SAVE_KEY);
          await page.locator("#watch-file-input").setInputFiles({
            name: complete ? "completed-watch.json" : "partial-watch.json",
            mimeType: "application/json",
            buffer: Buffer.from(incoming.raw),
          });
          await page.locator("#watch-file-preview").waitFor({ state: "visible" });
          assert.equal(await page.locator("#trend-table tbody tr").count(), priorRows, "preview leaves the existing trend history intact");
          assert.equal(await page.evaluate(key => localStorage.getItem(key), WATCH_SAVE_KEY), priorRaw);
          await page.getByRole("button", { name: "Replace current watch", exact: true }).click();
          await page.locator("#watch-file-preview").waitFor({ state: "hidden" });
          assert.equal(await page.evaluate(key => localStorage.getItem(key), WATCH_SAVE_KEY), incoming.raw);
          assert.equal(await page.locator("#watch-trends").count(), 1, "replacement reuses the single journal view");
          if (!await page.locator("#journal-details").evaluate(node => node.open)) await page.locator("#journal-details > summary").click();
          assert.equal(await page.locator("#trend-tide").getAttribute("max"), String(incoming.states.at(-1).day));
          assert.equal(await page.locator("#trend-tide").inputValue(), String(incoming.states.at(-1).day));
          for (const metric of metrics) {
            await page.locator("#trend-metric").selectOption(metric);
            const actual = await page.locator("#trend-table tbody tr").evaluateAll(rows => rows.map(row => [...row.children].slice(1).map(cell => Number(cell.textContent))));
            const expected = incoming.states.map(state => state.cells.map(cell => cell[metric]));
            assert.deepEqual(actual, expected, metric + " retains every opening/completed reading after file import");
            compared += expected.length * 3;
          }
          assert.equal(await page.evaluate(key => localStorage.getItem(key), WATCH_SAVE_KEY), incoming.raw, "reading the imported trends never writes progress");
          await page.locator("#trend-tide").focus();
          await page.keyboard.press("Home");
          assert.equal(await page.locator("#trend-tide").inputValue(), "0");
          if (complete && !offline) await page.locator("#watch-trends").screenshot({ path: new URL("../test-results/watch-file-trends-desktop.png", import.meta.url).pathname });
        }
      } finally { await context.close(); }
    }
    assert.equal(compared, 570, "five metrics, three cells, partial and complete histories, two delivery modes");
    assert.deepEqual(errors, []);
    assert.deepEqual(extraRequests, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
