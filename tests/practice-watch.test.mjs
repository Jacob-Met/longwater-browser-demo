import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdir, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { BrowserSession, initSync } from "../pkg/longwater_web.js";
import { serve } from "./server.mjs";

initSync({ module: await readFile(new URL("../pkg/longwater_web_bg.wasm", import.meta.url)) });
let browser;
let server;
before(async () => {
  await mkdir("test-results", { recursive: true });
  server = await serve();
  browser = await chromium.launch({ headless: true, executablePath: process.env.LONGWATER_CHROME_PATH || undefined });
});
after(async () => {
  await browser?.close();
  await server?.close();
});

async function open(options = {}, initScript) {
  const context = await browser.newContext({ viewport: { width: 1180, height: 1000 }, ...options });
  if (initScript) await context.addInitScript(initScript);
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(server.url);
  await page.waitForFunction(() => /Day \d+/.test(document.querySelector("#state-summary")?.textContent));
  return { page, errors, close: () => context.close() };
}

async function liveState(page) {
  return page.evaluate(() => {
    let saved;
    try { saved = Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])); }
    catch (error) { saved = { unavailable: error.name }; }
    return {
      summary: document.querySelector("#state-summary").textContent,
      readings: [0, 1, 2].map(i => document.querySelector("#cell-" + i + "-readings").textContent),
      selected: [...document.querySelectorAll(".game-control[data-cell]")].map(el => el.getAttribute("aria-pressed")),
      journal: document.querySelector("#watch-journal").textContent,
      notes: document.querySelector("#report-lines").textContent,
      event: document.querySelector("#event-notes").textContent,
      announcement: document.querySelector("#live").textContent,
      saved,
    };
  });
}

function nativeResult(turns) {
  const session = new BrowserSession();
  let before = null;
  let after = JSON.parse(session.snapshot_json());
  try {
    for (const [action, cell] of turns) {
      before = after;
      after = JSON.parse(session.take_turn(action, cell));
    }
    return { before, after };
  } finally { session.free(); }
}

async function assertReadings(page, turns) {
  const { before, after } = nativeResult(turns);
  const readings = [
    ["depth", "Depth (cm)"], ["salinity", "Salt (ppt)"],
    ["oxygen", "Oxygen (%)"], ["biomass", "Life (%)"], ["shade", "Canopy (of 3)"],
  ];
  const columns = (label, prior, value) => before ? [label, String(prior), String(value)] : [label, String(value)];
  const rows = table => table.locator("tbody tr").evaluateAll(items => items.map(row => [...row.children].map(cell => cell.textContent)));
  assert.deepEqual(await rows(page.getByRole("table", { name: "Practice resources", exact: true })), [
    columns("Water", before?.freshwater, after.freshwater),
    columns("Seed packs", before?.seedPacks, after.seedPacks),
  ]);
  for (const [index, cell] of after.cells.entries()) {
    assert.deepEqual(await rows(page.getByRole("table", { name: cell.name, exact: true })),
      readings.map(([key, label]) => columns(label, before?.cells[index][key], cell[key])));
  }
  assert.match(await page.locator("#practice-summary").textContent(), new RegExp("Practice tide " + after.day + " / 14"));
  if (after.report) {
    const notes = page.getByRole("region", { name: "Complete practice field notes", exact: true });
    assert.deepEqual(await notes.locator("li").allTextContents(), after.report.lines);
    assert.equal(await notes.locator("h3").textContent(), after.report.event.name);
    assert.equal(await notes.locator("p").textContent(), after.report.event.note);
    assert.match(await page.locator("#practice-output").textContent(), /action, the tide event, and dawn drift in all three cells/);
  } else {
    assert.equal(await page.getByRole("region", { name: "Complete practice field notes", exact: true }).count(), 0);
  }
  return after;
}

const action = (page, name) => page.getByRole("button", { name: new RegExp("^" + name + " in practice\\.") });
const cell = (page, name) => page.locator("#practice-watch").getByRole("button", { name, exact: true });
async function begin(page) {
  await page.getByRole("button", { name: "Open practice", exact: true }).click();
  assert.equal(await page.getByRole("dialog", { name: "Learn the tides", exact: true }).isVisible(), true);
}

test("practice pointer controls show whole native tides and preserve the resumed active watch", async () => {
  const { page, errors, close } = await open();
  try {
    await page.getByRole("button", { name: /^Cell 3:/ }).click();
    await page.getByRole("button", { name: /^Gate\./ }).click();
    await page.getByRole("button", { name: /^Cell 2:/ }).click();
    await page.getByRole("button", { name: /^Shade\./ }).click();
    await page.reload();
    await page.waitForFunction(() => document.querySelector("#watch-save-status")?.textContent.includes("Resumed"));
    const live = await liveState(page);
    assert.match(live.summary, /Day 2 of 14/);
    await begin(page);
    await assertReadings(page, []);
    assert.equal(await cell(page, "Heart Pool").getAttribute("aria-pressed"), "true");
    await page.screenshot({ path: "test-results/practice-opening.png" });
    const turns = [];
    for (const [name, id, choice] of [["North Bank", "north", "Gate"], ["Heart Pool", "heart", "Seed"], ["South Reach", "south", "Shade"]]) {
      await cell(page, name).click();
      await action(page, choice).click();
      turns.push([choice.toLowerCase(), id]);
      await assertReadings(page, turns);
      assert.deepEqual(await liveState(page), live);
    }
    await page.locator("#practice-output").scrollIntoViewIfNeeded();
    await page.screenshot({ path: "test-results/practice-result.png" });
    await page.getByRole("button", { name: "Close practice", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "Open practice", exact: true }).evaluate(el => el === document.activeElement), true);
    assert.deepEqual(await liveState(page), live);
    await begin(page);
    await assertReadings(page, []);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#practice-watch").evaluate(el => el.open), false);
    assert.deepEqual(await liveState(page), live);
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("practice keyboard controls keep native refusals and reach the fourteen-tide outcome", async () => {
  const { page, errors, close } = await open();
  try {
    const live = await liveState(page);
    await begin(page);
    assert.equal(await cell(page, "Heart Pool").evaluate(el => el === document.activeElement), true);
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Space");
    assert.equal(await cell(page, "North Bank").getAttribute("aria-pressed"), "true");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Space");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    assert.equal(await action(page, "Gate").evaluate(el => el === document.activeElement), true);
    const turns = [];
    for (const [choice, count, reason] of [["gate", 5, /No freshwater remains/], ["shade", 3, /maximum of three reed canopies/], ["seed", 5, /No seed satchels remain/]]) {
      for (let i = 0; i < count; i++) {
        await page.keyboard.press("Enter");
        turns.push([choice, "heart"]);
      }
      await assertReadings(page, turns);
      const output = await page.locator("#practice-output").textContent();
      await page.keyboard.press("Enter");
      assert.match(await page.locator("#practice-status").textContent(), reason);
      assert.equal(await page.locator("#practice-output").textContent(), output);
      await page.keyboard.press("g");
      await page.keyboard.press("r");
      assert.equal(await page.locator("#practice-output").textContent(), output);
      assert.equal(await page.locator("#new-watch-review").evaluate(el => el.open), false);
      if (choice !== "seed") await page.keyboard.press("Tab");
    }
    for (let i = 0; i < 5; i++) await page.keyboard.press("Shift+Tab");
    assert.equal(await cell(page, "North Bank").evaluate(el => el === document.activeElement), true);
    await page.keyboard.press("Space");
    for (let i = 0; i < 4; i++) await page.keyboard.press("Tab");
    assert.equal(await action(page, "Shade").evaluate(el => el === document.activeElement), true);
    await page.keyboard.press("Enter");
    turns.push(["shade", "north"]);
    const finished = await assertReadings(page, turns);
    assert.equal(finished.finished, true);
    assert.ok((await page.locator("#practice-summary").textContent()).includes(finished.outcome));
    await page.keyboard.press("Enter");
    assert.match(await page.locator("#practice-status").textContent(), /fourteen-tide watch is complete/);
    assert.deepEqual(await liveState(page), live);
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("button", { name: "Open practice", exact: true }).evaluate(el => el === document.activeElement), true);
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("practice restart and queued close events release only the owned native sessions", async () => {
  const { page, errors, close } = await open();
  try {
    const live = await liveState(page);
    await page.evaluate(async () => {
      const { BrowserSession } = await import(new URL("./pkg/longwater_web.js", location.href).href);
      const original = BrowserSession.prototype.free;
      window.practiceFreeCalls = 0;
      BrowserSession.prototype.free = function() { window.practiceFreeCalls++; return original.call(this); };
    });
    await begin(page);
    await action(page, "Shade").click();
    await page.getByRole("button", { name: "Restart practice", exact: true }).click();
    await assertReadings(page, []);
    assert.equal(await page.evaluate(() => window.practiceFreeCalls), 1);
    await page.getByRole("button", { name: "Close practice", exact: true }).click();
    assert.equal(await page.evaluate(() => window.practiceFreeCalls), 2);
    await begin(page);
    // Force the real queued-close seam: close and reopen before the old event is delivered.
    await page.evaluate(() => {
      document.querySelector("[data-practice-close]").click();
      document.querySelector("#practice-open").click();
    });
    await action(page, "Seed").click();
    await assertReadings(page, [["seed", "heart"]]);
    assert.equal(await page.evaluate(() => window.practiceFreeCalls), 3);
    await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(() => window.practiceFreeCalls), 4);
    assert.deepEqual(await liveState(page), live);
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("practice remains usable with blocked storage and retains the active watch when a modal cannot open", async () => {
  const { page, errors, close } = await open({}, () => {
    for (const method of ["getItem", "setItem"]) {
      Storage.prototype[method] = () => { throw new DOMException("Unavailable in this test", "SecurityError"); };
    }
  });
  try {
    const live = await liveState(page);
    await begin(page);
    await action(page, "Gate").click();
    await assertReadings(page, [["gate", "heart"]]);
    await page.keyboard.press("Escape");
    assert.deepEqual(await liveState(page), live);
    await page.evaluate(() => {
      const dialog = document.querySelector("#practice-watch");
      window.originalPracticeShowModal = dialog.showModal;
      dialog.showModal = () => { throw new Error("Modal unavailable in this test"); };
    });
    await page.getByRole("button", { name: "Open practice", exact: true }).click();
    assert.match(await page.locator("#practice-entry-status").textContent(), /Practice could not open: Modal unavailable/);
    assert.equal(await page.locator("#practice-watch").evaluate(el => el.open), false);
    assert.deepEqual(await liveState(page), live);
    await page.evaluate(() => { document.querySelector("#practice-watch").showModal = window.originalPracticeShowModal; });
    await begin(page);
    await assertReadings(page, []);
    await page.keyboard.press("Escape");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("practice is operable by touch at 320 pixels without horizontal clipping", async () => {
  const { page, errors, close } = await open({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  try {
    const live = await liveState(page);
    await page.getByRole("button", { name: "Open practice", exact: true }).tap();
    await cell(page, "North Bank").tap();
    await action(page, "Shade").tap();
    await assertReadings(page, [["shade", "north"]]);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.locator("#practice-watch").evaluate(el => el.scrollWidth <= el.clientWidth), true);
    for (const button of await page.locator("#practice-watch button").all()) {
      const rect = await button.boundingBox();
      assert.ok(rect.width >= 44 && rect.height >= 44);
    }
    await page.locator("#practice-summary").scrollIntoViewIfNeeded();
    await page.screenshot({ path: "test-results/practice-phone.png" });
    await page.getByRole("button", { name: "Close practice", exact: true }).tap();
    assert.deepEqual(await liveState(page), live);
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("the deterministic offline game contains fresh practice without external assets or live-watch changes", async () => {
  const packaged = JSON.parse(execFileSync(process.execPath, ["scripts/package.mjs", "test-results/Practice-offline.html"], { encoding: "utf8" }));
  const repeated = JSON.parse(execFileSync(process.execPath, ["scripts/package.mjs", "test-results/Practice-offline-repeat.html"], { encoding: "utf8" }));
  assert.equal(packaged.sha256, repeated.sha256);
  assert.ok(packaged.inputs.includes("practice-watch.js") && packaged.inputs.includes("practice-watch.css"));
  const context = await browser.newContext({ offline: true });
  const url = pathToFileURL(packaged.file).href;
  const requests = [];
  const errors = [];
  context.on("request", request => { if (request.url() !== url && !request.url().startsWith("data:")) requests.push(request.url()); });
  const reopen = async () => {
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(url);
    await page.waitForFunction(() => /Day \d+/.test(document.querySelector("#state-summary")?.textContent));
    return page;
  };
  try {
    let page = await reopen();
    await page.getByRole("button", { name: /^Gate\./ }).click();
    const live = await liveState(page);
    await begin(page);
    await action(page, "Seed").click();
    await assertReadings(page, [["seed", "heart"]]);
    assert.deepEqual(await liveState(page), live);
    await page.keyboard.press("Escape");
    await page.close();
    page = await reopen();
    assert.match(await page.locator("#state-summary").textContent(), /Day 1 of 14/);
    await begin(page);
    await assertReadings(page, []);
    await page.keyboard.press("Escape");
    assert.deepEqual(requests, []);
    assert.deepEqual(errors, []);
    await page.close();
  } finally { await context.close(); }
});
