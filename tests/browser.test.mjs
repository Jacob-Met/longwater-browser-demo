import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { serve } from "./server.mjs";

let browser;
let server;

before(async () => {
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
  await page.waitForFunction(() => document.querySelector("#live")?.textContent !== "Loading Longwater…");
  assert.deepEqual(errors, [], "startup has no uncaught script error");
  return { page, close: () => context.close() };
}

async function day(page) {
  return Number((await page.locator("#state-summary").textContent()).match(/Day (\d+)/)?.[1]);
}

test("the actual WASM watch exposes operable cells, actions, and complete readings", async () => {
  const { page, close } = await open();
  try {
    assert.equal(await page.getByRole("button").count(), 7);
    const cells = page.getByRole("button", { name: /^Cell [123]:/ });
    assert.equal(await cells.count(), 3);
    assert.equal(await cells.nth(1).getAttribute("aria-pressed"), "true");
    for (let i = 0; i < 3; i++) {
      const description = await page.locator(`#cell-${i}-readings`).textContent();
      for (const reading of ["Depth", "Salt", "Oxygen", "Life", "Canopy"]) assert.match(description, new RegExp(reading));
    }
    assert.match(await page.locator("#instructions").textContent(), /Tab/);
    assert.match(await page.getByRole("region", { name: "Field notes" }).textContent(), /Pick a cell/);
    assert.equal(await page.locator("canvas").getAttribute("aria-hidden"), "true");
  } finally { await close(); }
});

test("Tab, Enter, Space, arrows and shortcuts share one turn path", async () => {
  const { page, close } = await open();
  try {
    await page.keyboard.press("Tab");
    assert.equal(await page.getByRole("button", { name: "Reset watch" }).evaluate(el => el === document.activeElement), true);
    await page.keyboard.press("Tab");
    const first = page.getByRole("button", { name: /^Cell 1:/ });
    assert.equal(await first.evaluate(el => el === document.activeElement), true);
    await page.keyboard.press("Enter");
    assert.equal(await first.getAttribute("aria-pressed"), "true");
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.getByRole("button", { name: /^Cell 2:/ }).getAttribute("aria-pressed"), "true");
    assert.match(await page.locator("#live").textContent(), /Cell 2:/);
    await page.keyboard.press("3");
    assert.equal(await page.getByRole("button", { name: /^Cell 3:/ }).getAttribute("aria-pressed"), "true");
    const start = await day(page);
    await page.keyboard.press("g");
    assert.equal(await day(page), start + 1);
    await page.getByRole("button", { name: /^Gate/ }).press("Enter");
    assert.equal(await day(page), start + 2);
    await page.getByRole("button", { name: /^Seed/ }).press("Space");
    assert.equal(await day(page), start + 3);
    const notes = await page.getByRole("region", { name: "Field notes" }).textContent();
    assert.notEqual(notes.trim(), "Field notes");
    await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
  } finally { await close(); }
});

test("unavailable actions and modified/repeated shortcuts do not spend a tide", async () => {
  const { page, close } = await open();
  try {
    const shade = page.getByRole("button", { name: /^Shade/ });
    for (let i = 0; i < 4 && await shade.getAttribute("aria-disabled") !== "true"; i++) await shade.click();
    assert.equal(await shade.getAttribute("aria-disabled"), "true");
    const current = await day(page);
    await shade.evaluate(el => el.click());
    assert.equal(await day(page), current);
    assert.match(await page.locator("#live").textContent(), /canopy/i);
    await page.getByRole("button", { name: /^Cell 1:/ }).focus();
    assert.equal(await page.getByRole("button", { name: /^Cell 1:/ }).evaluate(el => {
      const event = new KeyboardEvent("keydown", { key: "r", ctrlKey: true, bubbles: true, cancelable: true });
      el.dispatchEvent(event);
      return event.defaultPrevented;
    }), false);
    assert.equal(await day(page), current, "browser control chords are not consumed as game resets");
    await page.getByRole("button", { name: /^Cell 1:/ }).dispatchEvent("keydown", { key: "r", repeat: true, bubbles: true });
    assert.equal(await day(page), current, "key auto-repeat does not reset a watch");
  } finally { await close(); }
});

test("a player can finish all fourteen tides using only semantic controls and reset", async () => {
  const { page, close } = await open();
  try {
    let turns = 0;
    while (!/watch closed/i.test(await page.locator("#state-summary").textContent()) && turns < 14) {
      let acted = false;
      for (let cell = 0; cell < 3 && !acted; cell++) {
        await page.getByRole("button", { name: new RegExp(`^Cell ${cell + 1}:`) }).click();
        const shade = page.getByRole("button", { name: /^Shade/ });
        if (await shade.getAttribute("aria-disabled") !== "true") { await shade.click(); acted = true; }
      }
      if (!acted) {
        for (const action of ["Gate", "Seed"]) {
          const button = page.getByRole("button", { name: new RegExp(`^${action}`) });
          if (await button.getAttribute("aria-disabled") !== "true") { await button.click(); acted = true; break; }
        }
      }
      assert.equal(acted, true, "there is an operable available action before the watch ends");
      turns++;
      assert.equal(await day(page), turns, "one action advances exactly one tide");
    }
    assert.equal(turns, 14);
    assert.match(await page.locator("#state-summary").textContent(), /watch closed/i);
    for (const action of ["Gate", "Shade", "Seed"]) assert.equal(await page.getByRole("button", { name: new RegExp(`^${action}`) }).getAttribute("aria-disabled"), "true");
    await page.getByRole("button", { name: "Reset watch" }).click();
    assert.equal(await day(page), 0);
    assert.equal(await page.getByRole("button", { name: /^Cell 2:/ }).getAttribute("aria-pressed"), "true");
  } finally { await close(); }
});

test("phone touch targets follow the canvas with separated notes and actions", async () => {
  const { page, close } = await open({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  try {
    const first = page.getByRole("button", { name: /^Cell 1:/ });
    await first.tap();
    assert.equal(await first.getAttribute("aria-pressed"), "true");
    const gate = page.getByRole("button", { name: /^Gate/ });
    await gate.tap();
    assert.equal(await day(page), 1);
    const bounds = await gate.boundingBox();
    assert.ok(bounds.width >= 44 && bounds.height >= 44);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: "test-results/phone.png", fullPage: true });
  } finally { await close(); }
});

test("failed WASM startup leaves an understandable error and no active controls", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.route("**/*.wasm", route => route.abort());
    await page.goto(server.url);
    await page.waitForFunction(() => document.querySelector("#live")?.textContent.includes("could not start"));
    assert.equal(await page.getByRole("button").count(), 7);
    assert.equal(await page.getByRole("button").evaluateAll(els => els.every(el => el.disabled)), true);
  } finally { await context.close(); }
});
