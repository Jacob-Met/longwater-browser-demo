import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "/Users/me/workspace/estate/production-evidence-49f845d0dece/browser-tools/node_modules/playwright/index.mjs";
import { serve } from "/Users/me/hamon-longwater-practice-71826f7aa69e/source/tests/server.mjs";
import { initSync, BrowserSession } from "/Users/me/hamon-longwater-practice-71826f7aa69e/source/pkg/longwater_web.js";

const root = "/Users/me/hamon-longwater-practice-71826f7aa69e/source";
const output = "/Users/me/hamon-longwater-practice-review-71826f7aa69e/results";
const expected = {
  "practice-watch.js": "31c3839022c89aa86c761087aeb1788c2ae9315d8e297b8a2d34cda956b63b18",
  "practice-watch.css": "44152eef4e21a6a0198e8994060ba9b5dc4cbb6d882f037897595c75c6927d29",
  "index.html": "9b2ec5615fe3bfe435d22136c39bde79a52d09c8fff6f82bcc4e81c496030d09",
  "game.js": "3b22d84c1ab0b9ebc34ff56b989335482acbebe57f1b6b64ecbce593aa6870be",
  "scripts/package.mjs": "4ce122fbfd7418f049289c3c07c4a6de0cf33684ce30c8bad61f16ed83b38264",
  "tests/browser.test.mjs": "3f767f72932b8ba95abda93ca0d42628fbca0916d4e06d59cc14e160561fbd47",
  "pkg/longwater_web_bg.wasm": "76deec059601613d588f4685444d407da81b3339f7cf7bdaf1bd1a13b285dae2",
};
const sha = value => createHash("sha256").update(value).digest("hex");
const result = {
  schema: "longwater-practice-independent-receiving/1",
  reviewer: "estate-71826f7aa69e/coordination",
  source_baseline: "e4e9bf82f6ebb363896559507a2fb5af07b490f5",
  source_cut: "production source-cut1",
  criteria: "criteria.json",
  started_at: new Date().toISOString(),
  tests: [],
  boundary: [
    "The live-isolation case uses the actual unmodified game and shipped WASM in a fresh browser profile.",
    "A separate Node WASM control session receives only live actions; no practice action is sent to that control.",
    "The lifetime case removes only the main bootstrap script from its isolated fixture and injects a forwarding real-WASM factory with one explicit pre-allocation exception.",
    "No author fourteen-tide, full-table, unavailable-action, queued-close or offline-package control is repeated.",
    "No product source, live user watch, saved user data, dependency or external browser profile is changed.",
  ],
};
let browser;
let server;

async function pins() {
  const values = [];
  for (const [path, expectedSha] of Object.entries(expected)) {
    const bytes = await readFile(root + "/" + path);
    assert.equal(sha(bytes), expectedSha, "frozen source pin: " + path);
    values.push({ path, bytes: bytes.length, sha256: sha(bytes) });
  }
  return values;
}
async function receive(name, fn) {
  const started = Date.now();
  try {
    const evidence = await fn();
    result.tests.push({ name, status: "passed", elapsed_ms: Date.now() - started, evidence });
  } catch (error) {
    result.tests.push({ name, status: "failed", elapsed_ms: Date.now() - started, error: String(error), stack: error.stack });
  }
}
async function openGame() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(() => {
    window.__reviewWrites = [];
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      window.__reviewWrites.push(String(key));
      return Reflect.apply(original, this, [key, value]);
    };
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(server.url + "/");
  await page.waitForFunction(() => !document.querySelector("#practice-open").disabled && /Day 0/.test(document.querySelector("#state-summary").textContent));
  return { context, page, errors };
}
async function live(page) {
  return page.evaluate(() => ({
    summary: document.querySelector("#state-summary").textContent,
    selected: [...document.querySelectorAll("#playfield [data-cell]")].map(el => el.getAttribute("aria-pressed")),
    readings: [0, 1, 2].map(i => document.querySelector("#cell-" + i + "-readings").textContent),
    event: document.querySelector("#event-notes").textContent,
    report: [...document.querySelectorAll("#report-lines li")].map(el => el.textContent),
    journal: document.querySelector("#watch-journal").innerHTML,
    save_status: document.querySelector("#watch-save-status").textContent,
    storage: Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])),
  }));
}
async function saved(page) {
  return page.evaluate(() => localStorage.getItem("longwater.watch.v1"));
}
async function practiceView(page) {
  return page.evaluate(() => ({
    summary: document.querySelector("#practice-summary").textContent,
    selected: [...document.querySelectorAll("[data-practice-cell]")].map(el => el.getAttribute("aria-pressed")),
    output: document.querySelector("#practice-output").innerHTML,
  }));
}
async function liveAction(page, index, action) {
  await page.locator('#playfield [data-cell="' + index + '"]').click();
  await page.locator('#playfield [data-action="' + action + '"]').click();
}
async function practiceAction(page, index, action) {
  await page.locator('[data-practice-cell="' + index + '"]').click();
  await page.locator('[data-practice-action="' + action + '"]').click();
}

await mkdir(output, { recursive: true });
try {
  result.source_before = await pins();
  const wasm = await readFile(root + "/pkg/longwater_web_bg.wasm");
  initSync({ module: wasm });
  server = await serve();
  browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  result.runtime = { node: process.version, chrome: browser.version(), source_server: server.url, headless: true, wasm_bytes: wasm.length };

  await receive("resumed live watch and its next native result survive interleaved practice", async () => {
    const { context, page, errors } = await openGame();
    const control = new BrowserSession();
    try {
      const opening = control.snapshot_json();
      await liveAction(page, 0, "gate");
      control.take_turn("gate", "north");
      await liveAction(page, 2, "seed");
      const beforeNative = control.take_turn("seed", "south");
      const beforeRaw = await saved(page);
      assert.equal(JSON.parse(beforeRaw).snapshot, beforeNative);
      await page.reload();
      await page.waitForFunction(() => /Day 2/.test(document.querySelector("#state-summary").textContent) && !document.querySelector("#practice-open").disabled);
      assert.equal(await saved(page), beforeRaw, "reload retains the actual saved record");
      const resumed = await live(page);
      const writesBefore = await page.evaluate(() => window.__reviewWrites.length);
      await page.locator("#practice-open").click();
      assert.match(await page.locator("#practice-summary").textContent(), /Practice tide 0 \/ 14/);
      await practiceAction(page, 0, "gate");
      await practiceAction(page, 2, "seed");
      await practiceAction(page, 1, "shade");
      assert.deepEqual(await live(page), resumed, "all active view and saved bytes remain exact");
      await page.locator("[data-practice-restart]").click();
      assert.match(await page.locator("#practice-summary").textContent(), /Practice tide 0 \/ 14/);
      await practiceAction(page, 2, "gate");
      await page.keyboard.press("Escape");
      assert.equal(await page.locator("#practice-watch").evaluate(el => el.open), false);
      assert.equal(await page.locator("#practice-open").evaluate(el => el === document.activeElement), true);
      assert.deepEqual(await live(page), resumed);
      assert.equal(await page.evaluate(() => window.__reviewWrites.length), writesBefore, "practice performs no same-value save writes either");

      // The control has received only the live history. A full exact next-result
      // comparison challenges hidden per-module native RNG/global interference.
      const expectedNext = control.take_turn("shade", "south");
      await page.locator('#playfield [data-action="shade"]').press("Enter");
      const afterRaw = await saved(page);
      const after = JSON.parse(afterRaw);
      assert.equal(after.snapshot, expectedNext, "entire future native result equals live-only control");
      assert.deepEqual(after.turns, [
        { action: "gate", cell: "north" },
        { action: "seed", cell: "south" },
        { action: "shade", cell: "south" },
      ]);
      assert.equal(after.selected, "south");
      assert.deepEqual(errors, []);
      return {
        opening_sha256: sha(opening),
        resumed_snapshot_sha256: sha(beforeNative),
        resumed_save_sha256: sha(beforeRaw),
        live_only_control_actions: after.turns,
        interleaved_practice_actions: [
          ["gate", "north"], ["seed", "south"], ["shade", "heart"],
          ["restart"], ["gate", "south"],
        ],
        future_native_snapshot_sha256: sha(expectedNext),
        future_snapshot_bytes: Buffer.byteLength(expectedNext),
        future_full_string_equal: true,
        practice_storage_write_count: 0,
        active_view_equal_before_next_live_action: true,
        page_errors: errors,
      };
    } finally {
      control.free();
      await context.close();
    }
  });

  await receive("native reset and practice dialogs keep keyboard focus and live actions separate", async () => {
    const { context, page, errors } = await openGame();
    try {
      await liveAction(page, 2, "gate");
      const accepted = await live(page);
      await page.locator("#reset-control").click();
      assert.equal(await page.locator("#new-watch-review").evaluate(el => el.open), true);
      assert.equal(await page.locator("#keep-watch").evaluate(el => el === document.activeElement), true);
      for (const key of ["g", "s", "r", "1", "ArrowLeft"]) await page.keyboard.press(key);
      const resetFocus = [];
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press("Tab");
        resetFocus.push(await page.evaluate(() => ({ id: document.activeElement.id, in_dialog: !!document.activeElement.closest("#new-watch-review") })));
      }
      assert.ok(resetFocus.every(x => x.in_dialog), "native reset dialog contains tab focus");
      assert.equal(await page.locator("#practice-watch").evaluate(el => el.open), false);
      assert.deepEqual(await live(page), accepted);
      await page.keyboard.press("Escape");
      assert.equal(await page.locator("#reset-control").evaluate(el => el === document.activeElement), true);

      await page.locator("#practice-open").focus();
      await page.keyboard.press("Enter");
      assert.equal(await page.locator("#practice-watch").evaluate(el => el.open), true);
      assert.equal(await page.locator('[data-practice-cell="1"]').evaluate(el => el === document.activeElement), true);
      const initialPractice = await practiceView(page);
      for (const key of ["g", "s", "r", "1", "ArrowRight"]) await page.keyboard.press(key);
      assert.deepEqual(await practiceView(page), initialPractice, "live-only shortcuts do not act in practice");
      assert.equal(await page.locator("#new-watch-review").evaluate(el => el.open), false);
      const practiceFocus = [];
      for (let i = 0; i < 18; i++) {
        await page.keyboard.press("Tab");
        practiceFocus.push(await page.evaluate(() => ({
          text: document.activeElement.textContent,
          in_dialog: !!document.activeElement.closest("#practice-watch"),
          is_live_control: document.activeElement.matches(".game-control"),
        })));
      }
      assert.ok(practiceFocus.every(x => x.in_dialog && !x.is_live_control), "native practice dialog contains tab focus");
      await page.locator('[data-practice-action="gate"]').focus();
      await page.keyboard.press("Enter");
      assert.match(await page.locator("#practice-summary").textContent(), /Practice tide 1 \/ 14/);
      assert.deepEqual(await live(page), accepted);
      await page.locator("[data-practice-close]").focus();
      await page.keyboard.press("Space");
      assert.equal(await page.locator("#practice-watch").evaluate(el => el.open), false);
      assert.equal(await page.locator("#practice-open").evaluate(el => el === document.activeElement), true);
      assert.deepEqual(await live(page), accepted);
      assert.deepEqual(errors, []);
      return { reset_focus_steps: resetFocus, practice_focus_steps: practiceFocus, live_snapshot_sha256: sha(JSON.parse(await saved(page)).snapshot), page_errors: errors };
    } finally {
      await context.close();
    }
  });

  await receive("failed restart preserves an accepted real-WASM session and navigation frees its successor", async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    const events = [];
    let pagehideDone;
    const sawPagehide = new Promise(resolve => { pagehideDone = resolve; });
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
      const text = message.text();
      if (!text.startsWith("COORD_LIFETIME ")) return;
      const event = JSON.parse(text.slice("COORD_LIFETIME ".length));
      events.push(event);
      if (event.kind === "pagehide") pagehideDone();
    });
    const html = await readFile(root + "/index.html", "utf8");
    const bootstrap = '  <script type="module" src="./game.js"></script>';
    assert.equal(html.split(bootstrap).length, 2, "exactly one main bootstrap removed from isolated component fixture");
    await page.route(server.url + "/", route => route.fulfill({ status: 200, contentType: "text/html", body: html.replace(bootstrap, "") }));
    try {
      await page.goto(server.url + "/");
      await page.evaluate(async () => {
        const native = await import("./pkg/longwater_web.js");
        await native.default();
        const { PracticeWatch } = await import("./practice-watch.js");
        const life = { failNext: false, allocated: 0, attempts: 0 };
        window.__reviewLife = life;
        const emit = event => console.info("COORD_LIFETIME " + JSON.stringify(event));
        const factory = () => {
          life.attempts++;
          if (life.failNext) {
            life.failNext = false;
            emit({ kind: "constructor_failure", attempt: life.attempts, before_allocation: true });
            throw new Error("Independent injected constructor admission failure");
          }
          const raw = new native.BrowserSession();
          const id = ++life.allocated;
          let freed = false;
          emit({ kind: "allocated", id, attempt: life.attempts });
          return {
            snapshot_json() { if (freed) throw new Error("Snapshot after free"); return raw.snapshot_json(); },
            take_turn(action, cell) {
              if (freed) throw new Error("Turn after free");
              const value = raw.take_turn(action, cell);
              emit({ kind: "accepted_turn", id, action, cell, day: JSON.parse(value).day });
              return value;
            },
            free() {
              if (freed) throw new Error("Duplicate native free");
              freed = true;
              raw.free();
              emit({ kind: "freed", id });
            },
          };
        };
        new PracticeWatch(document.querySelector("#practice-watch"), document.querySelector("#practice-open"), factory);
        window.addEventListener("pagehide", event => emit({ kind: "pagehide", persisted: event.persisted }));
      });
      await page.locator("#practice-open").click();
      await practiceAction(page, 0, "gate");
      const accepted = await practiceView(page);
      await page.evaluate(() => { window.__reviewLife.failNext = true; });
      await page.locator("[data-practice-restart]").click();
      assert.match(await page.locator("#practice-status").textContent(), /Practice could not restart: Independent injected constructor admission failure/);
      assert.deepEqual(await practiceView(page), accepted, "accepted practice readings and selection survive constructor failure");
      assert.equal(events.filter(x => x.kind === "freed").length, 0, "failed admission does not free the accepted session");
      await practiceAction(page, 1, "shade");
      assert.match(await page.locator("#practice-summary").textContent(), /Practice tide 2 \/ 14/);
      assert.ok(events.some(x => x.kind === "accepted_turn" && x.id === 1 && x.day === 2), "the original actual native session remains usable");
      await page.locator("[data-practice-restart]").click();
      assert.match(await page.locator("#practice-summary").textContent(), /Practice tide 0 \/ 14/);
      assert.deepEqual(events.filter(x => x.kind === "freed").map(x => x.id), [1]);
      assert.equal(events.filter(x => x.kind === "allocated").length, 2);
      await page.goto("about:blank");
      await Promise.race([sawPagehide, new Promise((_, reject) => setTimeout(() => reject(new Error("Native pagehide not observed")), 2000))]);
      assert.deepEqual(events.filter(x => x.kind === "freed").map(x => x.id), [1, 2], "actual pagehide frees the replacement exactly once");
      assert.deepEqual(events.filter(x => x.kind === "pagehide").map(x => x.persisted), [false]);
      assert.deepEqual(errors, []);
      return { injected_failure: "one factory exception before allocating native memory", retained_view_sha256: sha(JSON.stringify(accepted)), events, page_errors: errors };
    } finally {
      await context.close();
    }
  });
  result.source_after = await pins();
  result.source_unchanged = JSON.stringify(result.source_before) === JSON.stringify(result.source_after);
} catch (error) {
  result.precondition_or_finalization_error = { error: String(error), stack: error.stack };
} finally {
  await browser?.close();
  await server?.close();
  result.completed_at = new Date().toISOString();
  result.passed = result.tests.filter(x => x.status === "passed").length;
  result.failed = result.tests.filter(x => x.status === "failed").length;
  result.status = !result.precondition_or_finalization_error && result.failed === 0 && result.passed === 3 && result.source_unchanged ? "passed" : "failed";
  await writeFile(output + "/receiving.json", JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result));
  process.exitCode = result.status === "passed" ? 0 : 1;
}
