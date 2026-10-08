import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
import { serve } from "./server.mjs";

let server;
let browser;

before(async () => {
  server = await serve();
  browser = await chromium.launch({ headless: true, executablePath: process.env.LONGWATER_CHROME_PATH || undefined });
});

after(async () => {
  await browser?.close();
  await server?.close();
});

test("unavailable display state retires comparison without history reads or native allocations and can rebind", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(server.url);
    await page.waitForFunction(() => /Day 0/.test(document.querySelector("#state-summary")?.textContent));
    await page.locator('[data-action="gate"]').click();
    await page.waitForFunction(() => /Day 1/.test(document.querySelector("#state-summary")?.textContent));

    const observed = await page.evaluate(async () => {
      const { WatchChoice } = await import("/watch-choice.js");
      const { BrowserSession } = await import("/pkg/longwater_web.js");
      const { WATCH_SAVE_KEY } = await import("/watch-save.js");
      const live = () => ({
        summary: document.querySelector("#state-summary").textContent,
        journal: document.querySelector("#watch-journal").innerHTML,
        selected: [...document.querySelectorAll("[data-cell]")].map(node => node.getAttribute("aria-pressed")),
        saved: localStorage.getItem(WATCH_SAVE_KEY),
      });
      const liveBefore = live();
      const native = new BrowserSession();
      let snapshots;
      try {
        snapshots = [native.snapshot_json(), native.take_turn("gate", "heart")];
      } finally { native.free(); }
      const originalHistory = snapshots.slice();
      const root = document.createElement("section");
      root.id = "receiving-choice-invalidation";
      document.body.append(root);
      let historyReads = 0;
      let nativeAllocations = 0;
      let nativeFrees = 0;
      let refuse = false;
      const choice = new WatchChoice(root, {
        readHistory() {
          historyReads++;
          if (refuse) throw new Error("Authored unavailable-history boundary");
          return snapshots.slice();
        },
        createSession() {
          nativeAllocations++;
          const session = new BrowserSession();
          const free = session.free.bind(session);
          session.free = () => { nativeFrees++; free(); };
          return session;
        },
      });
      const view = () => ({
        panelHidden: root.hidden,
        formHidden: choice.form.hidden,
        detailsOpen: choice.details.open,
        resultHidden: choice.result.hidden,
        resultText: choice.result.textContent,
        resultTide: choice.result.dataset.tide ?? null,
        tideOptions: [...choice.tide.options].map(option => option.value),
        cellOptions: [...choice.cell.options].map(option => option.value),
        status: choice.status.textContent,
        historyReads,
        nativeAllocations,
        nativeFrees,
      });
      choice.synchronize(undefined);
      const beforeState = view();
      const token = {};
      choice.synchronize(token);
      choice.details.open = true;
      choice.action.value = "shade";
      choice.cell.value = "heart";
      choice.form.requestSubmit();
      const populated = view();

      refuse = true;
      choice.synchronize(null);
      const retired = view();
      choice.synchronize(null);
      choice.form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      const repeatedAndSubmitted = view();

      refuse = false;
      choice.synchronize(token);
      const rebound = view();
      choice.details.open = true;
      choice.action.value = "shade";
      choice.cell.value = "heart";
      choice.form.requestSubmit();
      const comparedAgain = view();
      const liveAfter = live();
      root.remove();
      return {
        beforeState, populated, retired, repeatedAndSubmitted, rebound, comparedAgain,
        sourceHistoryUnchanged: JSON.stringify(snapshots) === JSON.stringify(originalHistory),
        liveUnchanged: JSON.stringify(liveAfter) === JSON.stringify(liveBefore),
      };
    });

    const diagnostic = JSON.stringify(observed);
    assert.equal(observed.beforeState.historyReads, 0, diagnostic);
    assert.equal(observed.beforeState.nativeAllocations, 0, diagnostic);
    assert.equal(observed.populated.resultHidden, false, diagnostic);
    assert.match(observed.populated.resultText, /Played and alternative/, diagnostic);
    assert.equal(observed.populated.resultTide, "1", diagnostic);
    assert.equal(observed.populated.nativeAllocations, 2, diagnostic);
    assert.equal(observed.populated.nativeFrees, 2, diagnostic);
    assert.equal(observed.retired.panelHidden, true, diagnostic);
    assert.equal(observed.retired.formHidden, true, diagnostic);
    assert.equal(observed.retired.detailsOpen, false, diagnostic);
    assert.equal(observed.retired.resultHidden, true, diagnostic);
    assert.equal(observed.retired.resultText, "", diagnostic);
    assert.equal(observed.retired.resultTide, null, diagnostic);
    assert.equal(observed.retired.status, "", diagnostic);
    assert.deepEqual(observed.retired.tideOptions, [], diagnostic);
    assert.deepEqual(observed.retired.cellOptions, [], diagnostic);
    assert.equal(observed.retired.historyReads, observed.populated.historyReads, diagnostic);
    assert.equal(observed.retired.nativeAllocations, observed.populated.nativeAllocations, diagnostic);
    assert.equal(observed.retired.nativeFrees, observed.populated.nativeFrees, diagnostic);
    assert.deepEqual(observed.repeatedAndSubmitted, observed.retired, diagnostic);
    assert.equal(observed.rebound.panelHidden, false, diagnostic);
    assert.equal(observed.rebound.formHidden, false, diagnostic);
    assert.deepEqual(observed.rebound.tideOptions, ["1"], diagnostic);
    assert.equal(observed.rebound.historyReads, observed.retired.historyReads + 1, diagnostic);
    assert.equal(observed.rebound.nativeAllocations, observed.retired.nativeAllocations, diagnostic);
    assert.equal(observed.comparedAgain.resultHidden, false, diagnostic);
    assert.equal(observed.comparedAgain.resultText, observed.populated.resultText, diagnostic);
    assert.equal(observed.comparedAgain.nativeAllocations, 4, diagnostic);
    assert.equal(observed.comparedAgain.nativeFrees, 4, diagnostic);
    assert.equal(observed.sourceHistoryUnchanged, true, diagnostic);
    assert.equal(observed.liveUnchanged, true, diagnostic);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
