import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { serve } from "./server.mjs";

let server, browser;
before(async () => {
  server = await serve();
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.LONGWATER_CHROME_PATH || undefined,
  });
});
after(async () => {
  await browser?.close();
  await server?.close();
});

const day = async page => Number((await page.locator("#state-summary").textContent()).match(/Day (\d+)/)?.[1]);
const audioStarts = page => page.evaluate(() => window.__audioStarts.length);
const storage = (page, key) => page.evaluate(key => localStorage.getItem(key), key);

for (const offline of [false, true]) {
  test((offline ? "direct-open offline" : "HTTP") + " audio stays silent through shelf, rewind, restore and mute", async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const errors = [];
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    try {
      await context.addInitScript(() => {
        window.__audioStarts = [];
        const NativeAudio = window.AudioContext;
        if (!NativeAudio) throw new Error("This browser has no AudioContext for integration coverage.");
        window.AudioContext = class extends NativeAudio {
          createOscillator() {
            const oscillator = super.createOscillator();
            const start = oscillator.start.bind(oscillator);
            oscillator.start = at => {
              window.__audioStarts.push({ type: oscillator.type, at });
              return start(at);
            };
            return oscillator;
          }
        };
      });
      const url = offline
        ? pathToFileURL(resolve("downloads/Longwater-Fourteen-Tides.html")).href
        : server.url;
      await page.goto(url);
      await page.waitForFunction(() =>
        !document.querySelector("#sound-enabled")?.disabled &&
        !document.querySelector("#shelf-open")?.disabled &&
        !document.querySelector("#watch-file-open")?.disabled
      );
      assert.equal(await day(page), 0);
      assert.equal(await page.locator("#sound-enabled").isChecked(), false, "no autoplay");
      assert.equal(await audioStarts(page), 0, "no implicit audio initialization");

      await page.locator("#sound-enabled").check();
      await page.waitForFunction(() => document.querySelector("#sound-status")?.textContent === "On");
      const enabled = await audioStarts(page);
      assert.equal(enabled, 1, "explicit enable emits one quiet confirmation cue");

      await page.locator('[data-cell="1"]').click();
      assert.equal(await audioStarts(page), enabled, "selection is not a game action");
      await page.locator('[data-action="shade"]').click();
      assert.equal(await day(page), 1);
      const played = await audioStarts(page);
      assert.equal(played, enabled + 2, "accepted shade plays its two voices");
      const current = await storage(page, "longwater.watch.v1");
      assert.equal(JSON.parse(current).turns.length, 1);

      await page.locator("#shelf-open").click();
      await page.locator("#shelf-name").fill("Sound-safe rewind save");
      await page.locator("#shelf-keep").click();
      await page.locator("[data-shelf-id]").first().getByText("Day 1 of 14").waitFor({ state: "visible" });
      const kept = await storage(page, "longwater.shelf.v1");
      await page.locator("#shelf-close").click();
      assert.equal(await audioStarts(page), played, "shelving does not replay action cues");

      await page.locator("#watch-rewind-open").click();
      await page.locator("#watch-rewind-review").waitFor({ state: "visible" });
      await page.locator("#watch-rewind-keep").click();
      assert.equal(await day(page), 1);
      assert.equal(await storage(page, "longwater.watch.v1"), current);
      assert.equal(await audioStarts(page), played, "cancelling rewind is silent");

      await page.locator("#watch-rewind-open").click();
      await page.locator("#watch-rewind-confirm").click();
      await page.locator("#watch-rewind-review").waitFor({ state: "hidden" });
      assert.equal(await day(page), 0);
      assert.equal(JSON.parse(await storage(page, "longwater.watch.v1")).turns.length, 0);
      assert.equal(await storage(page, "longwater.shelf.v1"), kept);
      assert.equal(await audioStarts(page), played, "rewind is not an accepted gameplay turn");

      await page.locator("#shelf-open").click();
      await page.locator("[data-shelf-id]").first().getByRole("button", { name: "Open watch" }).click();
      await page.locator("#watch-file-preview").waitFor({ state: "visible" });
      await page.getByRole("button", { name: "Replace current watch", exact: true }).click();
      await page.locator("#watch-file-preview").waitFor({ state: "hidden" });
      assert.equal(await day(page), 1);
      assert.equal(await storage(page, "longwater.watch.v1"), current);
      assert.equal(await audioStarts(page), played, "shelf restore does not replay action cues");

      await page.locator("#sound-enabled").uncheck();
      await page.waitForFunction(() => document.querySelector("#sound-status")?.textContent === "Off");
      await page.locator('[data-cell="1"]').click();
      await page.locator('[data-action="shade"]').click();
      assert.equal(await day(page), 2, "gameplay stays usable after muting");
      assert.equal(await audioStarts(page), played, "muted gameplay remains silent");
      await page.reload();
      await page.waitForFunction(() => !document.querySelector("#sound-enabled")?.disabled);
      assert.equal(await day(page), 2);
      assert.equal(await page.locator("#sound-enabled").isChecked(), false, "no autoplay after reload");
      assert.equal(await audioStarts(page), 0, "new page has not initialized audio");
      assert.equal(await storage(page, "longwater.shelf.v1"), kept);
      const viewport = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
      assert.ok(viewport.scroll <= viewport.width + 1, "no mobile horizontal overflow");
      assert.deepEqual(errors, [], "real browser has no unhandled errors");
    } finally {
      await context.close();
    }
  });
}
