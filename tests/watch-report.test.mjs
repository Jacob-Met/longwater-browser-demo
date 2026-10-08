import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { initSync, BrowserSession } from "../pkg/longwater_web.js";
import { createWatchReport } from "../watch-report.js";
import { serve } from "./server.mjs";

let browser, server, temporary;
const metrics = ["depth", "salinity", "oxygen", "biomass", "shade"];
const actionLabels = {gate: "Gate", shade: "Shade", seed: "Seed"};
before(async () => {
  initSync({module: await readFile(new URL("../pkg/longwater_web_bg.wasm", import.meta.url))});
  server = await serve();
  browser = await chromium.launch({headless: true, executablePath: process.env.LONGWATER_CHROME_PATH || undefined});
  temporary = await mkdtemp(join(tmpdir(), "longwater-report-"));
  await mkdir("test-results", {recursive: true});
});
after(async () => {
  await browser?.close();
  await server?.close();
  if (temporary) await rm(temporary, {recursive: true, force: true});
});

async function game(options = {}, url = server.url) {
  const context = await browser.newContext({acceptDownloads: true, ...options});
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(url);
  await page.locator("#watch-journal").waitFor({state: "visible"});
  const sim = new BrowserSession();
  const states = [JSON.parse(sim.snapshot_json())];
  return {page, context, states,
    async turn(action, index) {
      await page.locator('[data-cell="' + index + '"]').click();
      await page.locator('[data-action="' + action + '"]').click();
      states.push(JSON.parse(sim.take_turn(action, states.at(-1).cells[index].id)));
      assert.equal(await page.locator("#journal-entries > li").count(), states.length - 1);
    },
    async close() {sim.free(); await context.close(); assert.deepEqual(errors, []);}
  };
}
async function preserved(page) {
  return page.evaluate(() => ({
    storage: {...localStorage},
    selected: [...document.querySelectorAll("[data-cell]")].map(node => node.getAttribute("aria-pressed")),
    summary: document.querySelector("#state-summary").textContent,
    journal: document.querySelector("#journal-entries").textContent,
    save: document.querySelector("#watch-save-status").textContent,
  }));
}
async function download(page, name) {
  const control = page.getByRole("button", {name: "Download watch report", exact: true});
  await control.focus();
  const [file] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Enter")]);
  assert.equal(await file.failure(), null);
  const path = join(temporary, name);
  await file.saveAs(path);
  return {path, filename: file.suggestedFilename(), bytes: await readFile(path)};
}
async function readReport(path) {
  const context = await browser.newContext({offline: true, javaScriptEnabled: false});
  const page = await context.newPage(), requests = [];
  page.on("request", request => requests.push(request.url()));
  await page.goto(pathToFileURL(path).href);
  return {page, async close() {
    assert.deepEqual(requests, [pathToFileURL(path).href], "the report loads no script, WASM, stylesheet or remote resource");
    await context.close();
  }};
}
async function values(section, before, after) {
  for (const cell of after.cells) {
    const old = before?.cells.find(item => item.id === cell.id);
    const record = section.locator('[data-cell-id="' + cell.id + '"]');
    assert.equal(await record.locator("th").textContent(), cell.name);
    for (const key of metrics) assert.equal(await record.locator('[data-reading="' + key + '"]').textContent(),
      old ? old[key] + " → " + cell[key] : String(cell[key]));
  }
  assert.equal(await section.locator(".resources").textContent(),
    "Freshwater: " + (before ? before.freshwater + " → " + after.freshwater : after.freshwater) +
    ". Seed packs: " + (before ? before.seedPacks + " → " + after.seedPacks : after.seedPacks) + ".");
}
async function assertReport(page, states) {
  const last = states.at(-1);
  assert.equal(await page.locator("#report-status").textContent(),
    last.finished ? "Watch closed · " + last.outcome : "Partial watch · " + last.day + " of 14 tides completed");
  assert.match(await page.locator(".provenance").textContent(), /Recorded from Longwater’s game simulation/);
  assert.equal(await page.locator("[data-tide]").count(), last.day);
  assert.equal(await page.locator("script,iframe,form,img,link,object").count(), 0);
  await values(page.locator("#report-opening"), null, states[0]);
  await values(page.locator("#report-overview"), states[0], last);
  for (let index = 1; index < states.length; index++) {
    const before = states[index - 1], after = states[index], report = after.report;
    const section = page.locator('[data-tide="' + index + '"]');
    assert.equal(await section.locator("h2").textContent(),
      "Tide " + index + " · " + actionLabels[report.action] + " · " + after.cells.find(cell => cell.id === report.cell).name);
    assert.equal(await section.locator(".event-name").textContent(), report.event.name);
    assert.equal(await section.locator(".event-note").textContent(), report.event.note);
    assert.deepEqual(await section.locator(".notes li").allTextContents(), report.lines);
    await values(section, before, after);
  }
}

test("a partial actual watch downloads exact native readings without changing play or saved bytes", async () => {
  const run = await game();
  try {
    assert.equal(await run.page.locator("#watch-report-download").isDisabled(), true);
    await run.turn("gate", 0);
    await run.turn("shade", 1);
    await run.turn("seed", 2);
    const before = await preserved(run.page);
    const file = await download(run.page, "partial.html");
    assert.equal(file.filename, "Longwater-watch-tide-03.html");
    assert.deepEqual(await preserved(run.page), before);
    const report = await readReport(file.path);
    await assertReport(report.page, run.states);
    await report.close();
    await run.page.keyboard.press("r");
    assert.deepEqual(await preserved(run.page), before, "report keyboard focus is not a game shortcut");
    await run.page.reload();
    await run.page.locator("#watch-journal").waitFor({state: "visible"});
    const resumed = await download(run.page, "resumed.html");
    assert.deepEqual(resumed.bytes, file.bytes, "the admitted native replay restores the exact whole report");
    await run.turn("shade", 0);
    assert.deepEqual(await readFile(file.path), file.bytes, "later play cannot rewrite an already downloaded snapshot");
  } finally {await run.close();}
});

test("a complete watch retains all fourteen reports and reset cannot export the previous watch", async () => {
  const run = await game();
  try {
    for (let cell = 0; cell < 3; cell++) for (let n = 0; n < 3; n++) await run.turn("shade", cell);
    for (let n = 0; n < 5; n++) await run.turn("gate", 0);
    assert.equal(run.states.at(-1).finished, true);
    const before = await preserved(run.page), file = await download(run.page, "completed.html");
    assert.deepEqual(await preserved(run.page), before);
    const report = await readReport(file.path);
    await assertReport(report.page, run.states);
    await report.page.emulateMedia({media: "print"});
    assert.equal(await report.page.locator("[data-tide]").count(), 14);
    assert.equal(await report.page.locator('[data-tide="14"]').isVisible(), true);
    await report.close();
    await run.page.locator("#reset-control").click();
    assert.equal(await run.page.getByRole("dialog", {name: "Start a new watch?"}).isVisible(), true);
    assert.deepEqual(await preserved(run.page), before, "reviewing reset retains the completed watch");
    await run.page.getByRole("button", {name: "Keep this watch", exact: true}).click();
    assert.deepEqual(await preserved(run.page), before);
    const kept = await download(run.page, "kept-completed.html");
    assert.deepEqual(kept.bytes, file.bytes, "declining reset retains the exact completed report");
    await run.page.locator("#reset-control").click();
    await run.page.getByRole("button", {name: "Start new watch", exact: true}).click();
    assert.equal(await run.page.locator("#watch-report-download").isDisabled(), true);
    assert.equal(await run.page.locator("#journal-entries > li").count(), 0);
    assert.match(await run.page.locator("#watch-report-status").textContent(), /Complete a tide/);
    await run.page.locator('[data-action="seed"]').click();
    const fresh = await download(run.page, "fresh.html");
    const sim = new BrowserSession();
    try {
      const states = [JSON.parse(sim.snapshot_json()), JSON.parse(sim.take_turn("seed", "heart"))];
      const opened = await readReport(fresh.path); await assertReport(opened.page, states); await opened.close();
    } finally {sim.free();}
  } finally {await run.close();}
});

test("preparation failure preserves the exact watch and allows an explicit successful retry", async () => {
  const run = await game();
  try {
    await run.turn("gate", 0);
    const before = await preserved(run.page);
    await run.page.evaluate(() => {globalThis.originalReportURL = URL.createObjectURL; URL.createObjectURL = () => {throw new Error("authored refusal");};});
    await run.page.locator("#watch-report-download").click();
    assert.match(await run.page.locator("#watch-report-status").textContent(), /Could not prepare/);
    assert.deepEqual(await preserved(run.page), before);
    assert.equal(await run.page.locator('a[download^="Longwater-watch-tide-"]').count(), 0);
    await run.page.evaluate(() => {URL.createObjectURL = globalThis.originalReportURL;});
    const file = await download(run.page, "retry.html");
    const opened = await readReport(file.path); await assertReport(opened.page, run.states); await opened.close();
    assert.deepEqual(await preserved(run.page), before);
  } finally {await run.close();}
});

test("the direct-open packaged game exposes the same report at phone width", async () => {
  const run = await game({offline: true, viewport: {width: 320, height: 568}, isMobile: true, hasTouch: true},
    pathToFileURL(resolve("downloads/Longwater-Fourteen-Tides.html")).href);
  try {
    await run.turn("shade", 2);
    const control = run.page.locator("#watch-report-download"); await control.scrollIntoViewIfNeeded();
    const box = await control.boundingBox(); assert.ok(box.width >= 44 && box.height >= 44);
    assert.equal(await run.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await run.page.locator("#watch-journal").screenshot({path: "test-results/watch-report-phone.png"});
    const before = await preserved(run.page), file = await download(run.page, "offline.html");
    assert.deepEqual(await preserved(run.page), before);
    const opened = await readReport(file.path); await assertReport(opened.page, run.states);
    await opened.page.setViewportSize({width: 320, height: 568});
    assert.equal(await opened.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const table = opened.page.locator("#report-overview .table-wrap");
    assert.equal(await table.getAttribute("tabindex"), "0");
    assert.equal(await table.evaluate(node => node.scrollWidth > node.clientWidth), true);
    // Poll from the test process: this report deliberately disables page JavaScript.
    const waitScroll = async predicate => {
      for (let attempt = 0; attempt < 40; attempt++) {
        if (predicate(await table.evaluate(node => node.scrollLeft))) return;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      assert.fail("the focused report table did not respond to horizontal arrow keys");
    };
    await table.focus(); await table.press("ArrowRight");
    await waitScroll(left => left > 0);
    await table.press("ArrowLeft");
    await waitScroll(left => left === 0);
    await opened.page.screenshot({path: "test-results/watch-report-readable.png", fullPage: true});
    await opened.close();
  } finally {await run.close();}
});

test("renderer treats every name and note as literal text and never mutates its inputs", async () => {
  const sim = new BrowserSession();
  try {
    const states = [JSON.parse(sim.snapshot_json()), JSON.parse(sim.take_turn("gate", "north"))];
    const literal = '<img src="https://invalid.example/x" onerror="alert(1)"> 科学😀 & \'quoted\'';
    for (const state of states) state.cells[0].name = literal;
    states[1].report.event.name = literal;
    states[1].report.event.note = literal;
    states[1].report.lines = [literal, "First line\nSecond line"];
    const before = structuredClone(states), result = createWatchReport(states);
    assert.deepEqual(states, before);
    assert.deepEqual(createWatchReport(states), result);
    const path = join(temporary, "literal.html"); await writeFile(path, result.html);
    const opened = await readReport(path); await assertReport(opened.page, states); await opened.close();
  } finally {sim.free();}
});

test("incomplete or nonfinite snapshots cannot become a successful report", () => {
  const sim = new BrowserSession();
  try {
    const states = [JSON.parse(sim.snapshot_json()), JSON.parse(sim.take_turn("gate", "north"))];
    assert.throws(() => createWatchReport([states[0]]), /one to fourteen/);
    const skipped = structuredClone(states); skipped[1].day = 2;
    assert.throws(() => createWatchReport(skipped), /ordered native/);
    const invalid = structuredClone(states); invalid[1].cells[0].biomass = NaN;
    assert.throws(() => createWatchReport(invalid), /ordered native/);
    const notes = structuredClone(states); delete notes[1].report.lines;
    assert.throws(() => createWatchReport(notes), /accepted tide/);
    const duplicate = structuredClone(states); duplicate[1].cells[1].id = duplicate[1].cells[0].id;
    assert.throws(() => createWatchReport(duplicate), /ordered native/);
  } finally {sim.free();}
});
