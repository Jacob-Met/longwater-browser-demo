import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

test("the packaged watch plays and restores its complete journal offline", async () => {
  const packaged = JSON.parse(execFileSync(process.execPath, ["scripts/package.mjs", "test-results/Longwater.html"], { encoding: "utf8" }));
  const repeated = JSON.parse(execFileSync(process.execPath, ["scripts/package.mjs", "test-results/Longwater-repeat.html"], { encoding: "utf8" }));
  assert.equal(packaged.sha256, repeated.sha256, "identical inputs produce identical playable bytes");
  const browser = await chromium.launch({ headless: true, executablePath: process.env.LONGWATER_CHROME_PATH || undefined });
  const context = await browser.newContext({ offline: true });
  const url = pathToFileURL(packaged.file).href;
  const unexpectedRequests = [];
  const errors = [];
  context.on("request", request => {
    if (request.url() !== url && !request.url().startsWith("data:")) unexpectedRequests.push(request.url());
  });
  const open = async () => {
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    page.on("pageerror", error => errors.push(error.message.slice(0, 300)));
    await page.goto(url);
    assert.deepEqual(errors, [], "the embedded modules load without script errors");
    await page.waitForFunction(() => /Day \d+/.test(document.querySelector("#state-summary")?.textContent));
    return page;
  };
  const day = async page => Number((await page.locator("#state-summary").textContent()).match(/Day (\d+)/)?.[1]);
  try {
    let page = await open();
    assert.equal(await page.getByRole("button").count(), 7);
    assert.equal(await day(page), 0);
    await page.getByRole("button", { name: /^Cell 3:/ }).click();
    await page.getByRole("button", { name: /^Gate/ }).click();
    assert.equal(await day(page), 1);
    assert.match(await page.locator("#report-lines").textContent(), /South Reach/);
    assert.equal(await page.locator("#journal-entries > li").count(), 1);
    assert.match(await page.locator("#watch-save-status").textContent(), /Day 1 of 14 saved/);
    const report = await page.locator("#journal-entries").textContent();
    const readings = await page.locator("#state-summary").textContent();
    assert.equal(await page.locator("#watch-journal").evaluate(el => getComputedStyle(el).borderTopStyle), "solid");
    await page.close();

    page = await open();
    assert.equal(await day(page), 1, "reopening the same offline file restores the tide");
    assert.equal(await page.getByRole("button", { name: /^Cell 3:/ }).getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator("#state-summary").textContent(), readings);
    assert.equal(await page.locator("#journal-entries").textContent(), report, "the complete native tide report returns with the watch");
    assert.match(await page.locator("#watch-save-status").textContent(), /Resumed your saved watch/);
    await page.getByRole("button", { name: "Reset watch" }).click();
    await page.getByRole("button", { name: "Start new watch", exact: true }).click();
    assert.equal(await day(page), 0);
    assert.equal(await page.locator("#journal-entries > li").count(), 0);
    await page.close();

    page = await open();
    assert.equal(await day(page), 0, "reset also replaces the saved offline watch");
    assert.equal(await page.locator("#journal-entries > li").count(), 0);
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpectedRequests, [], "all assets are embedded; no network or neighbouring files are requested");
  } finally {
    await context.close();
    await browser.close();
  }
});
