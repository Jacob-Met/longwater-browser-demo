import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { serve } from "./server.mjs";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");

test("a visitor downloads the current game and resumes its complete journal offline", async () => {
  const output = resolve(process.env.LONGWATER_DOWNLOAD_OUTPUT || "test-results/offline-download");
  await mkdir(output, { recursive: true });
  const temporary = await mkdtemp(join(tmpdir(), "longwater-download-"));
  const packaged = JSON.parse(execFileSync(process.execPath, ["scripts/package.mjs", join(temporary, "fresh.html")], { encoding: "utf8" }));
  const receipt = {
    startedAt: new Date().toISOString(),
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    driverSha256: hash(await readFile(new URL(import.meta.url))),
    packaged: {bytes: packaged.bytes, sha256: packaged.sha256, sourceSha256: packaged.sourceSha256, inputs: packaged.inputs},
    pageErrors: [], consoleErrors: [], responses: [], offOrigin: [], offlineRequests: [],
    stages: {}, passed: false,
  };
  const server = await serve();
  let browser, webContext, offlineContext, phase = "launch";
  const watch = async page => ({
    summary: await page.locator("#state-summary").textContent(),
    notes: await page.locator("#report-lines").textContent(),
    journal: await page.locator("#journal-entries").textContent(),
    journalEntries: await page.locator("#journal-entries > li").count(),
    save: await page.locator("#watch-save-status").textContent(),
  });
  const ready = async page => page.waitForFunction(() => /Day \d+/.test(document.querySelector("#state-summary")?.textContent));
  const observe = page => {
    page.setDefaultTimeout(8000);
    page.on("pageerror", error => receipt.pageErrors.push(error.message.slice(0, 1000)));
    page.on("console", message => { if (message.type() === "error") receipt.consoleErrors.push(message.text().slice(0, 1000)); });
  };
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.LONGWATER_CHROME_PATH || undefined });
    receipt.browserVersion = browser.version();
    webContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    webContext.on("request", request => {
      if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== server.url) receipt.offOrigin.push(request.url());
    });
    webContext.on("response", response => receipt.responses.push({url: response.url(), status: response.status()}));
    let page = await webContext.newPage();
    observe(page);
    phase = "online-watch";
    await page.goto(server.url);
    await ready(page);
    await page.getByRole("button", { name: /^Cell 3:/ }).click();
    await page.getByRole("button", { name: /^Gate/ }).click();
    receipt.stages.onlineBeforeDownload = await watch(page);
    assert.match(receipt.stages.onlineBeforeDownload.summary, /Day 1/);
    assert.equal(receipt.stages.onlineBeforeDownload.journalEntries, 1);
    await page.screenshot({path: join(output, "online-before-download.png"), fullPage: true});

    phase = "native-download";
    const link = page.getByRole("link", { name: "Download offline game", exact: true });
    assert.equal(await link.count(), 1, "the existing game page must expose one native offline download link");
    assert.equal(await link.getAttribute("href"), "./downloads/Longwater-Fourteen-Tides.html");
    assert.equal(await link.getAttribute("download"), "Longwater-Fourteen-Tides.html");
    assert.match(await page.locator("#offline-copy").textContent(), /separate watch/i);
    await link.scrollIntoViewIfNeeded();
    await link.focus();
    const [download] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Enter")]);
    assert.equal(await download.failure(), null);
    assert.equal(download.suggestedFilename(), "Longwater-Fourteen-Tides.html");
    const downloadedPath = join(temporary, download.suggestedFilename());
    await download.saveAs(downloadedPath);
    const downloadedBytes = await readFile(downloadedPath);
    receipt.download = {url: download.url(), filename: download.suggestedFilename(), bytes: downloadedBytes.length, sha256: hash(downloadedBytes)};
    assert.equal(receipt.download.sha256, packaged.sha256, "the actual downloaded file must equal a fresh build of current runtime inputs");
    assert.equal(hash(await readFile("downloads/Longwater-Fourteen-Tides.html")), packaged.sha256, "the published artifact must remain current; regenerate it after runtime changes");
    receipt.stages.onlineAfterDownload = await watch(page);
    assert.deepEqual(receipt.stages.onlineAfterDownload, receipt.stages.onlineBeforeDownload, "downloading must not advance or reset the online watch");
    await page.setViewportSize({width: 320, height: 568});
    await link.scrollIntoViewIfNeeded();
    const bounds = await link.boundingBox();
    receipt.downloadLinkBounds = bounds;
    assert.ok(bounds && bounds.width >= 44 && bounds.height >= 44, "the native download link must have a usable touch target");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "the download panel must fit the narrow page");
    await page.screenshot({path: join(output, "download-phone.png"), fullPage: true});
    await webContext.close();
    webContext = null;

    phase = "open-actual-download-offline";
    offlineContext = await browser.newContext({offline: true, viewport: {width: 1280, height: 900}});
    const fileUrl = pathToFileURL(downloadedPath).href;
    offlineContext.on("request", request => {
      if (request.url() !== fileUrl && !request.url().startsWith("data:")) receipt.offlineRequests.push(request.url());
    });
    const open = async () => {
      const next = await offlineContext.newPage();
      observe(next);
      await next.goto(fileUrl);
      await ready(next);
      return next;
    };
    page = await open();
    receipt.stages.offlineOpening = await watch(page);
    assert.match(receipt.stages.offlineOpening.summary, /Day 0/, "the downloaded game starts a separate watch");
    assert.equal(receipt.stages.offlineOpening.journalEntries, 0);
    assert.equal(await page.locator("#offline-download").count(), 0, "an offline copy must not offer a link to an absent neighbouring download");
    assert.match(await page.locator("#offline-copy").textContent(), /offline copy/i);
    assert.equal(await page.locator('meta[name="longwater-source-sha256"]').getAttribute("content"), packaged.sourceSha256);
    await page.getByRole("button", {name: /^Cell 3:/}).click();
    await page.getByRole("button", {name: /^Gate/}).click();
    receipt.stages.offlinePlayed = await watch(page);
    assert.match(receipt.stages.offlinePlayed.summary, /Day 1/);
    assert.match(receipt.stages.offlinePlayed.notes, /South Reach/);
    assert.equal(receipt.stages.offlinePlayed.journalEntries, 1);
    assert.match(receipt.stages.offlinePlayed.save, /Day 1 of 14 saved/);
    await page.close();

    phase = "reopen-actual-download-offline";
    page = await open();
    receipt.stages.offlineReopened = await watch(page);
    for (const field of ["summary", "notes", "journal", "journalEntries"]) {
      assert.deepEqual(receipt.stages.offlineReopened[field], receipt.stages.offlinePlayed[field], "offline reopen must restore the complete native " + field);
    }
    assert.match(receipt.stages.offlineReopened.save, /Resumed your saved watch/);
    await page.screenshot({path: join(output, "downloaded-watch-reopened.png"), fullPage: true});
    assert.deepEqual(receipt.pageErrors, []);
    assert.deepEqual(receipt.consoleErrors, []);
    assert.deepEqual(receipt.offOrigin, []);
    assert.deepEqual(receipt.offlineRequests, [], "the actual download must load no network or neighbouring files");
    assert.equal(receipt.responses.some(response => response.status >= 400), false);
    receipt.passed = true;
  } catch (error) {
    receipt.error = {phase, message: String(error), stack: error.stack};
    throw error;
  } finally {
    if (webContext) await webContext.close();
    if (offlineContext) await offlineContext.close();
    if (browser) await browser.close();
    await server.close();
    await rm(temporary, {recursive: true, force: true});
    receipt.finishedAt = new Date().toISOString();
    await writeFile(join(output, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
  }
});
