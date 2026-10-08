import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { serve } from "./server.mjs";
import { initSync, BrowserSession } from "../pkg/longwater_web.js";
import { SIMULATION_REVISION, WATCH_SAVE_KEY } from "../watch-save.js";

initSync({ module: await readFile(new URL("../pkg/longwater_web_bg.wasm", import.meta.url)) });
const metrics = ["depth", "salinity", "oxygen", "biomass", "shade"];
const actionNames = { gate: "Gate", shade: "Shade", seed: "Seed" };
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

function nativeWatch(complete) {
  const session = new BrowserSession();
  const states = [JSON.parse(session.snapshot_json())], turns = [];
  const take = (action, cell) => {
    states.push(JSON.parse(session.take_turn(action, cell)));
    turns.push({ action, cell });
  };
  try {
    if (complete) {
      while (!states.at(-1).finished) {
        assert.ok(turns.length < 14);
        const current = states.at(-1);
        const index = current.cells.findIndex(cell => cell.shade < 3);
        take(index >= 0 ? "shade" : current.freshwater > 0 ? "gate" : "seed",
          current.cells[index < 0 ? 0 : index].id);
      }
    } else {
      take("shade", "heart");
      take("gate", "north");
      take("seed", "south");
    }
    return { states, raw: JSON.stringify({
      version: 1, simulation: SIMULATION_REVISION, turns,
      selected: "south", snapshot: session.snapshot_json(),
    }) };
  } finally { session.free(); }
}

async function saved(page) {
  return page.evaluate(key => localStorage.getItem(key), WATCH_SAVE_KEY);
}

async function reportDownload(page) {
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download watch report", exact: true }).click();
  const file = await event;
  assert.equal(await file.failure(), null);
  const chunks = [];
  for await (const chunk of await file.createReadStream()) chunks.push(chunk);
  return { filename: file.suggestedFilename(), bytes: Buffer.concat(chunks) };
}

async function inspectReport(browser, path, states) {
  const context = await browser.newContext({ offline: true, javaScriptEnabled: false });
  const page = await context.newPage(), requests = [];
  const url = pathToFileURL(path).href;
  page.on("request", request => requests.push(request.url()));
  try {
    await page.goto(url);
    const actual = await page.evaluate(() => {
      const section = node => ({
        resources: node.querySelector(".resources").textContent,
        cells: [...node.querySelectorAll("tbody tr")].map(row => ({
          id: row.dataset.cellId,
          name: row.querySelector("th").textContent,
          readings: Object.fromEntries([...row.querySelectorAll("[data-reading]")].map(cell => [cell.dataset.reading, cell.textContent])),
        })),
      });
      return {
        status: document.querySelector("#report-status").textContent,
        activeContent: document.querySelectorAll("script,iframe,form,img,link,object").length,
        opening: section(document.querySelector("#report-opening")),
        overview: section(document.querySelector("#report-overview")),
        tides: [...document.querySelectorAll("section[data-tide]")].map(node => ({
          day: Number(node.dataset.tide),
          title: node.querySelector("h2").textContent,
          event: node.querySelector(".event-name").textContent,
          note: node.querySelector(".event-note").textContent,
          lines: [...node.querySelectorAll(".notes li")].map(item => item.textContent),
          ...section(node),
        })),
      };
    });
    const table = (before, after) => ({
      resources: "Freshwater: " + (before ? before.freshwater + " → " + after.freshwater : after.freshwater)
        + ". Seed packs: " + (before ? before.seedPacks + " → " + after.seedPacks : after.seedPacks) + ".",
      cells: after.cells.map(cell => {
        const previous = before?.cells.find(item => item.id === cell.id);
        return {
          id: cell.id, name: cell.name,
          readings: Object.fromEntries(metrics.map(key => [key, previous ? previous[key] + " → " + cell[key] : String(cell[key])])),
        };
      }),
    });
    const last = states.at(-1);
    const expected = {
      status: last.finished ? "Watch closed · " + last.outcome : "Partial watch · " + last.day + " of 14 tides completed",
      activeContent: 0,
      opening: table(null, states[0]),
      overview: table(states[0], last),
      tides: states.slice(1).map((state, index) => ({
        day: state.day,
        title: "Tide " + state.day + " · " + actionNames[state.report.action] + " · " + state.cells.find(cell => cell.id === state.report.cell).name,
        event: state.report.event.name,
        note: state.report.event.note,
        lines: state.report.lines,
        ...table(states[index], state),
      })),
    };
    assert.deepEqual(actual, expected, "the downloaded report contains exactly the adopted native replay");
    assert.deepEqual(requests, [url], "the readable report requires no game or external resource");
    return (states.length + 1) * 3 * metrics.length;
  } finally { await context.close(); }
}

test("partial and completed watch-file adoption rebuilds exact downloadable reports online and offline", async () => {
  const server = await serve();
  const output = new URL("../test-results/", import.meta.url);
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.LONGWATER_CHROME_PATH || undefined });
  const errors = [], unexpected = [], receipts = [];
  let checkedReadings = 0;
  try {
    for (const offline of [false, true]) {
      const context = await browser.newContext({ offline, acceptDownloads: true });
      const url = offline ? new URL("../downloads/Longwater-Fourteen-Tides.html", import.meta.url).href : server.url;
      if (offline) context.on("request", request => {
        if (request.url() !== url && !/^(data|blob):/.test(request.url())) unexpected.push(request.url());
      });
      try {
        const page = await context.newPage();
        page.setDefaultTimeout(7000);
        page.on("pageerror", error => errors.push(error.message));
        await page.goto(url);
        await page.waitForFunction(() => !document.querySelector("#watch-file-open")?.disabled);
        await page.locator('[data-action="gate"]').click();
        let currentReport = await reportDownload(page);
        for (const complete of [false, true]) {
          const incoming = nativeWatch(complete), last = incoming.states.at(-1);
          const previousSave = await saved(page);
          const previousJournal = await page.locator("#journal-entries").textContent();
          await page.locator("#watch-file-input").setInputFiles({
            name: complete ? "completed-watch.json" : "partial-watch.json",
            mimeType: "application/json", buffer: Buffer.from(incoming.raw),
          });
          await page.locator("#watch-file-preview").waitFor({ state: "visible" });
          assert.equal(await saved(page), previousSave);
          assert.equal(await page.locator("#journal-entries").textContent(), previousJournal);
          const previewReport = await reportDownload(page);
          assert.deepEqual(previewReport, currentReport, "preview alone cannot replace the current report");
          assert.equal(await page.locator("#watch-file-preview").isVisible(), true);
          await page.getByRole("button", { name: "Replace current watch", exact: true }).click();
          await page.locator("#watch-file-preview").waitFor({ state: "hidden" });
          assert.equal(await saved(page), incoming.raw);
          assert.equal(await page.locator("#watch-journal").isVisible(), true);
          assert.equal(await page.locator("#journal-entries > li").count(), last.day);
          assert.equal(await page.locator("#watch-report-download").count(), 1);
          assert.equal(await page.locator("#watch-report-download").isDisabled(), false);
          currentReport = await reportDownload(page);
          assert.equal(currentReport.filename, "Longwater-watch-tide-" + String(last.day).padStart(2, "0") + ".html");
          const path = new URL("watch-file-report-" + (offline ? "offline-" : "online-") + last.day + ".html", output);
          await writeFile(path, currentReport.bytes);
          checkedReadings += await inspectReport(browser, path.pathname, incoming.states);
          assert.equal(await saved(page), incoming.raw, "reading and downloading the adopted report preserve progress");
          assert.equal(await page.locator('[data-cell="2"]').getAttribute("aria-pressed"), "true");
          receipts.push({
            offline, day: last.day, finished: last.finished,
            watchSha256: sha256(incoming.raw), reportFile: path.pathname,
            reportSha256: sha256(currentReport.bytes), reportBytes: currentReport.bytes.length,
            filename: currentReport.filename, nativeSnapshots: incoming.states.length,
          });
        }
      } finally { await context.close(); }
    }
    assert.equal(checkedReadings, 630, "every opening, overview and tide cell reading in four adopted reports");
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    await writeFile(new URL("watch-file-report-results.json", output), JSON.stringify({ checkedReadings, receipts, errors, unexpected }, null, 2) + "\n");
  } finally {
    await browser.close();
    await server.close();
  }
});
