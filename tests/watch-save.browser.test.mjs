import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { initSync, BrowserSession } from "../pkg/longwater_web.js";
import { WATCH_SAVE_KEY } from "../watch-save.js";

const { chromium } = await import(process.env.LONGWATER_PLAYWRIGHT_MODULE || "playwright");
initSync({ module: await readFile(new URL("../pkg/longwater_web_bg.wasm", import.meta.url)) });
const files = new Map([
  ["/", ["index.html", "text/html"]],
  ["/index.html", ["index.html", "text/html"]],
  ["/style.css", ["style.css", "text/css"]],
  ["/game.js", ["game.js", "text/javascript"]],
  ["/watch-save.js", ["watch-save.js", "text/javascript"]],
  ["/watch-save.css", ["watch-save.css", "text/css"]],
  ["/watch-choice.js", ["watch-choice.js", "text/javascript"]],
  ["/watch-choice-model.js", ["watch-choice-model.js", "text/javascript"]],
  ["/watch-choice.css", ["watch-choice.css", "text/css"]],
  ["/journal.js", ["journal.js", "text/javascript"]],
  ["/journal.css", ["journal.css", "text/css"]],
  ["/watch-trends.js", ["watch-trends.js", "text/javascript"]],
  ["/watch-trends.css", ["watch-trends.css", "text/css"]],
  ["/pkg/longwater_web.js", ["pkg/longwater_web.js", "text/javascript"]],
  ["/pkg/longwater_web_bg.wasm", ["pkg/longwater_web_bg.wasm", "application/wasm"]],
]);
let browser;
let server;
let url;

before(async () => {
  server = createServer(async (request, response) => {
    const file = files.get(new URL(request.url, "http://localhost").pathname);
    if (!file) { response.writeHead(404).end(); return; }
    try {
      const content = await readFile(new URL(`../${file[0]}`, import.meta.url));
      response.writeHead(200, { "content-type": file[1], "cache-control": "no-store" }).end(content);
    } catch { response.writeHead(500).end(); }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  url = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, executablePath: process.env.LONGWATER_CHROME_PATH || undefined });
  await mkdir(new URL("../test-results/", import.meta.url), { recursive: true });
});

after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

async function ready(page) {
  await page.waitForFunction(() => !document.querySelector("#watch-save-status").textContent.startsWith("Loading"));
  assert.doesNotMatch(await page.locator("#live").textContent(), /could not start/);
}

async function open(t, options = {}) {
  const context = await browser.newContext(options);
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], "no uncaught browser errors"));
  await page.goto(url);
  await ready(page);
  return { context, page };
}

async function key(page, value) {
  // Both the canonical canvas and the independent semantic-control branch
  // expose these gameplay shortcuts. This acceptance can qualify composition.
  const controls = page.locator(".game-control:not(:disabled)");
  const target = await controls.count() ? controls.first() : page.locator("#game");
  await target.press(value);
}

async function raw(page) { return page.evaluate(key => localStorage.getItem(key), WATCH_SAVE_KEY); }
async function saved(page) { return JSON.parse(await raw(page)); }
async function day(page) {
  const text = await page.locator("#live").textContent();
  if (/Fourteen tides complete/.test(text)) return 14;
  return Number(text.match(/Day (\d+)/)?.[1]);
}

test("closing and reopening the page resumes the same native watch and selected cell", async t => {
  const { context, page } = await open(t, { viewport: { width: 1280, height: 900 } });
  await key(page, "h");
  await key(page, "1");
  await key(page, "g");
  await key(page, "3");
  await key(page, "s");
  const before = await raw(page);
  assert.equal((await saved(page)).turns.length, 3);
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(url);
  await ready(reopened);
  assert.match(await reopened.locator("#watch-save-status").textContent(), /Resumed.*day 3/);
  assert.equal(await day(reopened), 3);
  assert.equal(await raw(reopened), before);
  await key(reopened, "h");
  const expected = new BrowserSession();
  t.after(() => expected.free());
  expected.take_turn("shade", "heart");
  expected.take_turn("gate", "north");
  expected.take_turn("seed", "south");
  expected.take_turn("shade", "south");
  assert.equal((await saved(reopened)).snapshot, expected.snapshot_json());
  assert.equal((await saved(reopened)).selected, "south");
  await reopened.screenshot({ path: new URL("../test-results/watch-resumed-desktop.png", import.meta.url).pathname, fullPage: true });
});

test("a fourteen-tide ending survives reload and explicit reset stores a fresh watch", async t => {
  const { page } = await open(t);
  const expected = new BrowserSession();
  t.after(() => expected.free());
  while (!JSON.parse(expected.snapshot_json()).finished) {
    const state = JSON.parse(expected.snapshot_json());
    const cell = state.cells.findIndex(item => item.shade < 3);
    const index = cell < 0 ? 0 : cell;
    const action = cell >= 0 ? "shade" : state.freshwater > 0 ? "gate" : "seed";
    await key(page, String(index + 1));
    await key(page, { shade: "h", gate: "g", seed: "s" }[action]);
    expected.take_turn(action, state.cells[index].id);
  }
  const ending = await raw(page);
  assert.equal((await saved(page)).snapshot, expected.snapshot_json());
  assert.equal((await saved(page)).turns.length, 14);
  await key(page, "g");
  assert.equal(await raw(page), ending, "an action after completion cannot add a saved tide");
  await page.reload();
  await ready(page);
  assert.equal(await day(page), 14);
  assert.match(await page.locator("#live").textContent(), new RegExp(JSON.parse(expected.snapshot_json()).outcome));
  await key(page, "r");
  await page.getByRole("button", { name: "Start new watch", exact: true }).click();
  assert.equal(await day(page), 0);
  assert.deepEqual((await saved(page)).turns, []);
  await page.reload();
  await ready(page);
  assert.equal(await day(page), 0);
  assert.equal((await saved(page)).selected, "heart");
});

test("unavailable actions leave the saved history unchanged", async t => {
  const { page } = await open(t);
  for (let index = 0; index < 3; index++) await key(page, "h");
  const before = await raw(page);
  await key(page, "h");
  assert.equal(await raw(page), before);
  assert.equal((await saved(page)).turns.length, 3);
  await page.reload();
  await ready(page);
  assert.equal(await day(page), 3);
});

test("failed replay preserves saved data while play continues until an explicit reset", async t => {
  const { page } = await open(t, { viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await key(page, "h");
  const valid = await saved(page);
  const invalid = [
    "unreadable saved watch",
    JSON.stringify({ ...valid, version: 999 }),
    JSON.stringify({ ...valid, snapshot: valid.snapshot.replace('"day":1', '"day":9') }),
  ];
  for (const value of invalid) {
    await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: WATCH_SAVE_KEY, value });
    await page.reload();
    await ready(page);
    assert.match(await page.locator("#watch-save-status").textContent(), /could not be resumed.*kept/);
    assert.equal(await day(page), 0);
    await key(page, "g");
    assert.equal(await day(page), 1);
    assert.equal(await raw(page), value);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: new URL("../test-results/watch-recovery-phone.png", import.meta.url).pathname, fullPage: true });
    await key(page, "r");
    await page.getByRole("button", { name: "Start new watch", exact: true }).click();
    assert.equal((await saved(page)).turns.length, 0);
  }
});

test("quota failure retains the running tide and the visible retry saves without advancing it", async t => {
  const { page } = await open(t);
  await key(page, "h");
  const before = await raw(page);
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException("Full", "QuotaExceededError");
      return original.call(this, name, value);
    };
    window.restoreSaveWrites = () => { Storage.prototype.setItem = original; };
  }, WATCH_SAVE_KEY);
  await key(page, "h");
  assert.equal(await day(page), 2);
  assert.equal(await raw(page), before);
  assert.match(await page.locator("#watch-save-status").textContent(), /could not be saved/);
  assert.equal(await page.getByRole("button", { name: "Try saving again" }).isVisible(), true);
  await page.evaluate(() => window.restoreSaveWrites());
  await page.getByRole("button", { name: "Try saving again" }).click();
  assert.equal((await saved(page)).turns.length, 2);
  assert.equal(await day(page), 2);
  assert.match(await page.locator("#watch-save-status").textContent(), /Day 2.*saved/);
  await page.reload();
  await ready(page);
  assert.equal(await day(page), 2);
});

test("a blocked storage getter still allows a playable watch and later save retry", async t => {
  const context = await browser.newContext();
  t.after(() => context.close());
  await context.addInitScript(() => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    let denied = true;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        if (denied) throw new DOMException("Blocked", "SecurityError");
        return original.get.call(window);
      },
    });
    window.allowWatchStorage = () => { denied = false; };
  });
  const page = await context.newPage();
  await page.goto(url);
  await ready(page);
  await key(page, "g");
  assert.equal(await day(page), 1);
  assert.match(await page.locator("#watch-save-status").textContent(), /could not be saved/);
  await page.evaluate(() => window.allowWatchStorage());
  await page.getByRole("button", { name: "Try saving again" }).click();
  assert.equal((await saved(page)).turns.length, 1);
});

test("two tabs detect divergent storage and do not overwrite the other watch", async t => {
  const { context, page: first } = await open(t);
  await key(first, "h");
  const second = await context.newPage();
  await second.goto(url);
  await ready(second);
  assert.equal(await day(second), 1);
  await key(first, "h");
  const winning = await raw(first);
  await second.waitForFunction(() => document.querySelector("#watch-save-status").textContent.includes("another tab"));
  await key(second, "g");
  assert.equal(await raw(second), winning);
  await key(second, "r");
  await second.getByRole("button", { name: "Start new watch", exact: true }).click();
  assert.deepEqual((await saved(second)).turns, []);
  await first.waitForFunction(() => document.querySelector("#watch-save-status").textContent.includes("another tab"));
  await key(first, "g");
  assert.deepEqual((await saved(first)).turns, []);
});

test("failed WASM startup never replaces an existing saved watch", async t => {
  const { page } = await open(t);
  await key(page, "h");
  const before = await raw(page);
  await page.route("**/*.wasm", route => route.abort());
  await page.reload();
  await page.waitForFunction(() => document.querySelector("#live").textContent.includes("could not start"));
  assert.match(await page.locator("#watch-save-status").textContent(), /Any saved watch has been kept/);
  assert.equal(await raw(page), before);
});
