import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { after, before, test } from "node:test";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const root = resolve(process.env.LONGWATER_ROOT ?? resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const output = resolve(process.env.LONGWATER_NEW_WATCH_OUTPUT ?? "test-results/new-watch");
const { serve } = await import(pathToFileURL(resolve(root, "tests/server.mjs")));
const { initSync, BrowserSession } = await import(pathToFileURL(resolve(root, "pkg/longwater_web.js")));
const { WATCH_SAVE_KEY } = await import(pathToFileURL(resolve(root, "watch-save.js")));
let browser;
let server;

before(async () => {
  await mkdir(output, { recursive: true });
  initSync({ module: await readFile(resolve(root, "pkg/longwater_web_bg.wasm")) });
  server = await serve();
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.LONGWATER_CHROME_PATH || undefined,
    ...(process.env.LONGWATER_TEMP ? { env: { ...process.env, TMPDIR: process.env.LONGWATER_TEMP } } : {}),
  });
});

after(async () => {
  await browser?.close();
  await server?.close();
});

async function open(options = {}, setup, url = server.url) {
  const context = await browser.newContext(options);
  const errors = [];
  const requests = [];
  const page = await context.newPage();
  page.setDefaultTimeout(3000);
  page.on("pageerror", e => errors.push(e.message));
  page.on("request", request => {
    const allowed = url.startsWith("file:") ? request.url() === url : request.url().startsWith(server.url + "/");
    if (!allowed && !request.url().startsWith("data:")) requests.push(request.url());
  });
  if (setup) await setup(page);
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector("#live")?.textContent !== "Loading Longwater…");
  assert.equal(await page.locator("#startup-error").isVisible(), false);
  const sim = new BrowserSession();
  let native = JSON.parse(sim.snapshot_json());
  return {
    page, context,
    get native() { return native; },
    async turn(action, index) {
      await page.locator(`[data-cell="${index}"]`).click();
      await page.locator(`[data-action="${action}"]`).click();
      native = JSON.parse(sim.take_turn(action, native.cells[index].id));
      assert.equal(await page.locator("#journal-entries > li").count(), native.day);
      assert.equal((await snapshot(page)).day, native.day);
      return native;
    },
    async close() {
      sim.free();
      await context.close();
      assert.deepEqual(errors, [], "no uncaught browser errors");
      assert.deepEqual(requests, [], "no external page request");
    },
  };
}

async function snapshot(page) {
  return page.evaluate(key => {
    const text = id => document.querySelector(id)?.textContent;
    let saved;
    try { saved = localStorage.getItem(key); } catch { saved = "storage-unavailable"; }
    return {
      day: Number(text("#state-summary").match(/Day (\d+)/)?.[1]),
      summary: text("#state-summary"),
      selected: [...document.querySelectorAll("[data-cell]")].map(x => x.getAttribute("aria-pressed")),
      readings: [0, 1, 2].map(i => text(`#cell-${i}-readings`)),
      report: text("#report-lines"),
      event: text("#event-notes"),
      journal: document.querySelector("#watch-journal").innerHTML,
      saved,
    };
  }, WATCH_SAVE_KEY);
}

async function partial(game) {
  await game.turn("gate", 0);
  await game.turn("shade", 1);
  await game.turn("seed", 2);
  await game.page.locator('[data-cell="0"]').click();
}

const dialog = page => page.getByRole("dialog", { name: "Start a new watch?" });
const keep = page => page.getByRole("button", { name: "Keep this watch", exact: true });
const confirm = page => page.getByRole("button", { name: "Start new watch", exact: true });

test("Reset reviews replacement before changing a native watch; cancel retains exact saved state and journal", async () => {
  const game = await open({ viewport: { width: 1280, height: 900 } });
  const { page } = game;
  try {
    await partial(game);
    await page.locator("#journal-details > summary").click();
    await page.locator('[data-tide="1"]').locator("summary").click();
    const before = await snapshot(page);
    assert.equal(before.day, 3);
    await page.locator("#reset-control").click();
    assert.deepEqual(await snapshot(page), before, "requesting reset must preserve all watch evidence");
    assert.equal(await dialog(page).isVisible(), true);
    assert.match(await dialog(page).textContent(), /3.*14/);
    assert.match(await dialog(page).textContent(), /journal/i);
    assert.equal(await keep(page).evaluate(x => x === document.activeElement), true);
    await page.screenshot({ path: resolve(output, "desktop-review.png"), fullPage: true, caret: "initial" });
    await keep(page).click();
    assert.equal(await dialog(page).isVisible(), false);
    assert.deepEqual(await snapshot(page), before);
    assert.equal(await page.locator("#reset-control").evaluate(x => x === document.activeElement), true);
    await page.reload();
    await page.waitForFunction(() => document.querySelector("#state-summary")?.textContent.includes("Day 3"));
    const reopened = await snapshot(page);
    assert.equal(reopened.saved, before.saved);
    assert.deepEqual(reopened.readings, before.readings);
    assert.equal(await page.locator("#journal-entries > li").count(), 3);
  } finally { await game.close(); }
});

test("R uses the same review; Escape and the initially focused Enter action keep the watch", async () => {
  const game = await open();
  const { page } = game;
  try {
    await partial(game);
    const trigger = page.locator('[data-cell="0"]');
    await trigger.focus();
    const before = await snapshot(page);
    await page.keyboard.press("r");
    assert.deepEqual(await snapshot(page), before);
    assert.equal(await dialog(page).isVisible(), true);
    await page.keyboard.press("Escape");
    assert.equal(await dialog(page).isVisible(), false);
    assert.deepEqual(await snapshot(page), before);
    assert.equal(await trigger.evaluate(x => x === document.activeElement), true);
    await page.keyboard.press("r");
    await page.keyboard.press("Enter");
    assert.equal(await dialog(page).isVisible(), false);
    assert.deepEqual(await snapshot(page), before, "default keyboard action cancels replacement");
  } finally { await game.close(); }
});

test("confirming starts exactly the native opening and resets the saved journal once", async () => {
  const game = await open();
  const { page } = game;
  try {
    const opening = await snapshot(page);
    await partial(game);
    await page.locator("#reset-control").click();
    assert.equal(await dialog(page).isVisible(), true);
    await confirm(page).click();
    const current = await snapshot(page);
    assert.equal(current.day, 0);
    assert.deepEqual(current.readings, opening.readings);
    assert.deepEqual(current.selected, opening.selected);
    assert.equal(await page.locator("#journal-entries > li").count(), 0);
    const saved = JSON.parse(current.saved);
    assert.deepEqual(saved.turns, []);
    await page.reload();
    await page.waitForFunction(() => document.querySelector("#state-summary")?.textContent.includes("Day 0"));
    assert.equal((await snapshot(page)).saved, current.saved);
    await page.locator('[data-action="gate"]').click();
    assert.equal((await snapshot(page)).day, 1, "new watch remains playable");
  } finally { await game.close(); }
});

test("completed fourteen-tide outcome and full history survive a declined new watch", async () => {
  const game = await open();
  const { page } = game;
  try {
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) await game.turn("shade", i);
    for (let i = 0; i < 5; i++) await game.turn("gate", 0);
    const before = await snapshot(page);
    assert.equal(before.day, 14);
    assert.match(before.summary, /watch closed/i);
    await page.locator("#reset-control").click();
    assert.deepEqual(await snapshot(page), before);
    assert.match(await dialog(page).textContent(), /14.*14/);
    await keep(page).click();
    assert.deepEqual(await snapshot(page), before);
    for (const action of ["gate", "shade", "seed"]) assert.equal(await page.locator(`[data-action="${action}"]`).getAttribute("aria-disabled"), "true");
  } finally { await game.close(); }
});

test("phone touch can cancel then deliberately confirm without horizontal overflow", async () => {
  const game = await open({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const { page } = game;
  try {
    await game.turn("gate", 0);
    const before = await snapshot(page);
    await page.locator("#reset-control").tap();
    assert.deepEqual(await snapshot(page), before);
    assert.equal(await dialog(page).isVisible(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    for (const button of [keep(page), confirm(page)]) {
      const box = await button.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44);
      assert.ok(box.x >= 0 && box.x + box.width <= 320);
    }
    await page.screenshot({ path: resolve(output, "phone-review.png"), fullPage: true, caret: "initial" });
    await keep(page).tap();
    assert.deepEqual(await snapshot(page), before);
    await page.locator("#reset-control").tap();
    await confirm(page).tap();
    assert.equal((await snapshot(page)).day, 0);
  } finally { await game.close(); }
});

test("the review blocks background game controls and ignores their keyboard shortcuts", async () => {
  const game = await open();
  const { page } = game;
  try {
    await partial(game);
    const before = await snapshot(page);
    await page.locator("#reset-control").click();
    assert.equal(await dialog(page).isVisible(), true);
    for (const key of ["g", "h", "s", "1", "ArrowLeft", "r"]) await page.keyboard.press(key);
    assert.deepEqual(await snapshot(page), before);
    assert.equal(await dialog(page).isVisible(), true);
    const visited = new Set();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      const focus = await dialog(page).evaluate(x => ({
        inside: x.contains(document.activeElement),
        id: document.activeElement?.id,
        tag: document.activeElement?.tagName,
        hasFocus: document.hasFocus(),
        modal: x.matches(":modal"),
      }));
      assert.equal(focus.modal, true);
      // Native Tab navigation may visit browser chrome; no background page
      // control may gain focus while the review is modal.
      assert.ok(focus.inside || (focus.tag === "BODY" && !focus.hasFocus));
      if (focus.inside) visited.add(focus.id);
    }
    assert.deepEqual([...visited].sort(), ["keep-watch", "start-new-watch"]);
    await keep(page).focus();
    const backgroundFocus = await page.locator(".game-control").evaluateAll(controls =>
      controls.map(control => {
        control.focus();
        return document.querySelector("#new-watch-review").contains(document.activeElement);
      }));
    assert.ok(backgroundFocus.length >= 7);
    assert.ok(backgroundFocus.every(Boolean), "background game controls remain inert");
    await page.keyboard.press("g");
    assert.deepEqual(await snapshot(page), before);
    await page.keyboard.press("Escape");
    assert.deepEqual(await snapshot(page), before);
  } finally { await game.close(); }
});

test("a saved-watch change from another tab invalidates an already open replacement review", async () => {
  const game = await open();
  const { page, context } = game;
  try {
    await partial(game);
    const before = await snapshot(page);
    const peer = await context.newPage();
    await peer.goto(server.url);
    await peer.waitForFunction(() => document.querySelector("#state-summary")?.textContent.includes("Day 3"));
    await page.locator("#reset-control").click();
    assert.equal(await dialog(page).isVisible(), true);
    await peer.locator('[data-action="gate"]').click();
    await page.waitForFunction(() => document.querySelector("#watch-save-status")?.textContent.includes("another tab"));
    const savedByPeer = await peer.evaluate(key => localStorage.getItem(key), WATCH_SAVE_KEY);
    assert.equal(await dialog(page).isVisible(), false, "review of older save is dismissed");
    const after = await snapshot(page);
    assert.equal(after.day, before.day);
    assert.equal(after.journal, before.journal);
    assert.equal(after.saved, savedByPeer, "changed saved watch is not overwritten");
    assert.match(await page.locator("#live").textContent(), /changed.*review|review.*changed/i);
    await peer.close();
  } finally { await game.close(); }
});

test("unavailable browser storage still lets the player decline then explicitly start a fresh watch", async () => {
  const game = await open({}, page => page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Unavailable fixture", "SecurityError"); } });
  }));
  const { page } = game;
  try {
    await partial(game);
    const before = await snapshot(page);
    assert.equal(before.saved, "storage-unavailable");
    await page.locator("#reset-control").click();
    assert.deepEqual(await snapshot(page), before);
    await keep(page).click();
    assert.deepEqual(await snapshot(page), before);
    await page.locator("#reset-control").click();
    await confirm(page).click();
    assert.equal((await snapshot(page)).day, 0);
    assert.match(await page.locator("#watch-save-status").textContent(), /could not be saved/i);
    assert.equal(await page.locator("#watch-save-retry").isVisible(), true);
  } finally { await game.close(); }
});

test("modified or held R and R while reading the journal remain inert", async () => {
  const game = await open();
  const { page } = game;
  try {
    await partial(game);
    const before = await snapshot(page);
    const button = page.locator('[data-cell="0"]');
    await button.dispatchEvent("keydown", { key: "r", ctrlKey: true, bubbles: true });
    await button.dispatchEvent("keydown", { key: "r", repeat: true, bubbles: true });
    await page.locator("#journal-details > summary").focus();
    await page.keyboard.press("r");
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.deepEqual(await snapshot(page), before);
  } finally { await game.close(); }
});

test("ordinary actions still advance exactly the existing native simulation", async () => {
  const game = await open();
  const { page } = game;
  try {
    await partial(game);
    const saved = JSON.parse((await snapshot(page)).saved);
    assert.deepEqual(JSON.parse(saved.snapshot), game.native);
    assert.equal(saved.turns.length, 3);
    assert.equal(await page.getByRole("dialog").count(), 0);
  } finally { await game.close(); }
});

test("the assembled offline file preserves a declined watch and saves only an explicitly confirmed new watch", async () => {
  const packaged = JSON.parse(execFileSync(process.execPath, [
    resolve(root, "scripts/package.mjs"), resolve(output, "new-watch-offline.html"),
  ], { encoding: "utf8" }));
  const game = await open({ offline: true }, undefined, pathToFileURL(packaged.file).href);
  const { page } = game;
  try {
    const opening = await snapshot(page);
    await partial(game);
    await page.locator("#journal-details > summary").click();
    const before = await snapshot(page);
    await page.locator("#reset-control").click();
    assert.deepEqual(await snapshot(page), before);
    assert.equal(await dialog(page).isVisible(), true);
    assert.equal(await dialog(page).evaluate(x => x.matches(":modal")), true);
    await keep(page).click();
    assert.deepEqual(await snapshot(page), before, "declining keeps exact offline save and history");
    await page.locator("#reset-control").click();
    await page.keyboard.press("Escape");
    assert.deepEqual(await snapshot(page), before);
    await page.locator("#reset-control").click();
    await confirm(page).click();
    const fresh = await snapshot(page);
    assert.equal(fresh.day, 0);
    assert.deepEqual(fresh.readings, opening.readings);
    assert.deepEqual(fresh.selected, opening.selected);
    assert.deepEqual(JSON.parse(fresh.saved).turns, []);
    await page.reload();
    await page.waitForFunction(() => document.querySelector("#state-summary")?.textContent.includes("Day 0"));
    assert.equal((await snapshot(page)).saved, fresh.saved);
    assert.equal(await page.locator("#journal-entries > li").count(), 0);
    await page.locator('[data-action="gate"]').click();
    assert.equal((await snapshot(page)).day, 1);
  } finally { await game.close(); }
});
