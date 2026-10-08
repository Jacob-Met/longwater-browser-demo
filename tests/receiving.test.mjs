import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { initSync, BrowserSession } from "../pkg/longwater_web.js";

// This receiver runs the shipped WASM independently of game.js. All expected
// measurements, resources, events and report lines come from that second real
// session; the browser must expose the same complete result through its DOM.
const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const servedRoot = resolve(process.env.LONGWATER_REVIEW_ROOT || sourceRoot);
const evidenceRoot = resolve(process.env.LONGWATER_REVIEW_OUTPUT || "test-results/receiving");
const mutation = process.env.LONGWATER_REVIEW_MUTATION || "";
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm" };
let server;
let browser;
let origin;
const transcript = [];

before(async () => {
  initSync({ module: await readFile(resolve(servedRoot, "pkg/longwater_web_bg.wasm")) });
  await mkdir(evidenceRoot, { recursive: true });
  server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, "http://localhost").pathname;
      const path = resolve(servedRoot, `.${pathname === "/" ? "/index.html" : pathname}`);
      if (!path.startsWith(servedRoot + sep)) return void response.writeHead(403).end();
      const body = await readFile(path);
      response.writeHead(200, { "content-type": types[extname(path)] || "application/octet-stream" }).end(body);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, executablePath: process.env.LONGWATER_CHROME_PATH || undefined });
});

after(async () => {
  await writeFile(resolve(evidenceRoot, "transcript.json"), JSON.stringify({ servedRoot, mutation, browser: browser?.version(), transcript }, null, 2) + "\n");
  await browser?.close();
  await new Promise(resolve => server?.close(resolve));
});

async function open(options = {}, setup) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  if (mutation) {
    await page.route("**/game.js", async route => {
      let script = await readFile(resolve(servedRoot, "game.js"), "utf8");
      if (mutation === "stale-readings") script = script.replace("cellReadings(state.cells[i])", "cellReadings({ ...state.cells[i], depth: 0 })");
      else if (mutation === "truncated-report") script = script.replace("reportLines().map(line =>", "reportLines().slice(0, 1).map(line =>");
      else if (mutation === "wrong-cell") script = script.replace("state.cells[selected].id", "state.cells[0].id");
      else throw new Error(`Unrecognized review mutation: ${mutation}`);
      await route.fulfill({ contentType: "text/javascript", body: script });
    });
  }
  if (setup) await setup(page);
  await page.goto(origin);
  await page.waitForFunction(() => document.querySelector("#live")?.textContent !== "Loading Longwater…");
  return { page, errors, close: () => context.close() };
}

function cellFacts(cell) {
  return [`${cell.zone}; ${cell.material}.`, `Depth ${cell.depth} centimetres.`, `Salt ${cell.salinity} parts per thousand.`, `Oxygen ${cell.oxygen} percent.`, `Life ${cell.biomass} percent.`, `Canopy ${cell.shade} of 3.`];
}

async function verifyPublicState(page, state, selected, label) {
  assert.equal(await page.locator("#state-summary").count(), 1, `${label}: the game exposes a semantic state summary`);
  const summary = await page.locator("#state-summary").textContent();
  assert.match(summary, new RegExp(`Day ${state.day} of 14\\.`), label);
  assert.match(summary, new RegExp(`Water ${state.freshwater}; seed packs ${state.seedPacks}\\.`), label);
  if (state.finished) assert.ok(summary.includes(`Outcome: ${state.outcome}.`), label);
  for (let i = 0; i < state.cells.length; i++) {
    const cell = state.cells[i];
    const button = page.getByRole("button", { name: `Cell ${i + 1}: ${cell.name}`, exact: true });
    assert.equal(await button.count(), 1, `${label}: named cell ${i + 1}`);
    assert.equal(await button.getAttribute("aria-pressed"), String(i === selected), `${label}: cell selection`);
    const descriptionId = await button.getAttribute("aria-describedby");
    assert.ok(descriptionId, `${label}: a cell has an associated description`);
    const description = await page.locator(`[id="${descriptionId}"]`).textContent();
    for (const fact of cellFacts(cell)) assert.ok(description.includes(fact), `${label}: missing native fact ${fact}; received ${description}`);
  }
  if (state.report) {
    assert.deepEqual(await page.locator("#report-lines li").allTextContents(), state.report.lines, `${label}: complete native field notes`);
    const notes = await page.locator("#event-notes").textContent();
    assert.equal(notes, `${state.report.event.name}. ${state.report.event.note}`, `${label}: complete native event`);
  }
  const live = await page.locator("#live").textContent();
  assert.ok(live.includes(`Cell ${selected + 1}: ${state.cells[selected].name} selected.`), `${label}: selection announcement`);
  for (const fact of cellFacts(state.cells[selected])) assert.ok(live.includes(fact), `${label}: live native fact ${fact}`);
  for (const [action, unavailable] of [["gate", state.freshwater < 1], ["shade", state.cells[selected].shade >= 3], ["seed", state.seedPacks < 1]]) {
    assert.equal(await page.locator(`[data-action="${action}"]`).getAttribute("aria-disabled"), String(state.finished || unavailable), `${label}: ${action} availability`);
  }
  transcript.push({ label, selected, state });
}

test("every tide exposes the real independent WASM result, including all cell facts and untruncated events", async () => {
  const { page, errors, close } = await open();
  const native = new BrowserSession();
  let state = JSON.parse(native.snapshot_json());
  try {
    await verifyPublicState(page, state, 1, "initial");
    // Deliberately vary cells, input mechanisms and actions. Each browser action
    // is paired with a separate WASM action on the actual named native cell.
    const turns = [[2,"gate"],[0,"seed"],[1,"shade"],[2,"seed"],[0,"gate"],[1,"seed"],[2,"shade"],[0,"shade"],[1,"gate"],[2,"gate"],[0,"seed"],[1,"shade"],[2,"seed"],[0,"gate"]];
    for (let i = 0; i < turns.length; i++) {
      const [selected, action] = turns[i];
      const cell = page.locator(`[data-cell="${selected}"]`);
      if (i % 2) { await cell.focus(); await cell.press("Enter"); }
      else await cell.click();
      await verifyPublicState(page, state, selected, `selected-${i + 1}`);
      const button = page.locator(`[data-action="${action}"]`);
      if (i % 3 === 0) await button.click();
      else if (i % 3 === 1) await button.press("Space");
      else { await cell.focus(); await page.keyboard.press({ gate: "g", shade: "h", seed: "s" }[action]); }
      state = JSON.parse(native.take_turn(action, state.cells[selected].id));
      await verifyPublicState(page, state, selected, `tide-${i + 1}`);
      for (const line of state.report.lines) assert.ok((await page.locator("#live").textContent()).includes(line), `tide-${i + 1}: full announced report`);
    }
    assert.equal(state.day, 14);
    assert.equal(state.finished, true);
    const finalReadings = await page.locator("#state-summary").textContent();
    for (const action of ["gate", "shade", "seed"]) {
      await page.locator(`[data-action="${action}"]`).evaluate(el => el.click());
      assert.equal(await page.locator("#state-summary").textContent(), finalReadings, "finished controls cannot mutate the watch");
    }
    await page.getByRole("button", { name: "Reset watch", exact: true }).click();
    state = JSON.parse(native.restart());
    await verifyPublicState(page, state, 1, "reset");
    assert.deepEqual(errors, []);
  } finally { native.free(); await close(); }
});

test("a failed WASM turn reports the exception, preserves public state and allows a subsequent real turn", async () => {
  const { page, errors, close } = await open({}, async page => {
    await page.route("**/pkg/longwater_web.js", async route => {
      let glue = await readFile(resolve(servedRoot, "pkg/longwater_web.js"), "utf8");
      glue += '\nconst reviewTakeTurn = BrowserSession.prototype.take_turn; let reviewRejectOnce = true; BrowserSession.prototype.take_turn = function(...args) { if (reviewRejectOnce) { reviewRejectOnce = false; throw new Error("Independent receiving turn failure"); } return reviewTakeTurn.apply(this, args); };\n';
      await route.fulfill({ contentType: "text/javascript", body: glue });
    });
  });
  const native = new BrowserSession();
  try {
    const before = await page.locator("#state-summary").textContent();
    const factsBefore = await page.locator('[id$="-readings"]').allTextContents();
    await page.locator('[data-action="gate"]').click();
    assert.equal(await page.locator("#live").textContent(), "Independent receiving turn failure");
    assert.equal(await page.locator("#state-summary").textContent(), before);
    assert.deepEqual(await page.locator('[id$="-readings"]').allTextContents(), factsBefore);
    await page.locator('[data-action="gate"]').click();
    const state = JSON.parse(native.take_turn("gate", "heart"));
    await verifyPublicState(page, state, 1, "recovered-turn");
    assert.deepEqual(errors, []);
  } finally { native.free(); await close(); }
});

test("a game shortcut stays local to its focused controls and refuses composed and modified input", async () => {
  const { page, errors, close } = await open();
  try {
    const unchanged = await page.locator("#state-summary").textContent();
    await page.evaluate(() => { const text = document.createElement("textarea"); text.id = "receiving-text"; document.body.append(text); text.focus(); });
    await page.keyboard.type("gsh123r");
    assert.equal(await page.locator("#receiving-text").inputValue(), "gsh123r");
    assert.equal(await page.locator("#state-summary").textContent(), unchanged);
    const cell = page.locator('[data-cell="0"]');
    await cell.focus();
    for (const init of [{ altKey: true }, { ctrlKey: true }, { metaKey: true }, { isComposing: true }, { repeat: true }]) {
      const prevented = await cell.evaluate((el, init) => { const event = new KeyboardEvent("keydown", { key: "g", bubbles: true, cancelable: true, ...init }); el.dispatchEvent(event); return event.defaultPrevented; }, init);
      assert.equal(prevented, false, `shortcut refuses ${JSON.stringify(init)}`);
      assert.equal(await page.locator("#state-summary").textContent(), unchanged);
    }
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("320px touch and desktop resizing retain separate reachable cell and action targets", async () => {
  const { page, errors, close } = await open({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  try {
    for (const viewport of [{ width: 320, height: 568 }, { width: 1280, height: 720 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      const cells = await page.locator("[data-cell]").evaluateAll(els => els.map(el => { const { x,y,width,height } = el.getBoundingClientRect(); return { x,y,width,height }; }));
      const actions = await page.locator("[data-action]").evaluateAll(els => els.map(el => { const { x,y,width,height } = el.getBoundingClientRect(); return { x,y,width,height }; }));
      for (const box of [...cells, ...actions]) assert.ok(box.width >= 44 && box.height >= 44, `44px target at ${viewport.width}px`);
      const overlap = (a,b) => Math.min(a.x+a.width,b.x+b.width) > Math.max(a.x,b.x) && Math.min(a.y+a.height,b.y+b.height) > Math.max(a.y,b.y);
      const boxes = [...cells, ...actions];
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert.equal(overlap(boxes[i],boxes[j]), false, `separate touch controls ${i}/${j}`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.locator('[data-cell="2"]').tap();
      assert.equal(await page.locator('[data-cell="2"]').getAttribute("aria-pressed"), "true");
      await page.screenshot({ path: resolve(evidenceRoot, `viewport-${viewport.width}.png`), fullPage: true });
    }
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("real canvas title, resource totals and reset stay readable without overlap on narrow screens", async () => {
  const { page, errors, close } = await open({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 2 }, page => page.addInitScript(() => {
    const fillRect = CanvasRenderingContext2D.prototype.fillRect;
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillRect = function(x,y,w,h) {
      if (x === 0 && y === 0) window.receivingCanvasText = [];
      return fillRect.call(this,x,y,w,h);
    };
    CanvasRenderingContext2D.prototype.fillText = function(text,x,y,maxWidth) {
      const measured = this.measureText(text);
      const width = Math.min(measured.width, maxWidth ?? Infinity);
      const left = x - (this.textAlign === "right" || this.textAlign === "end" ? width : this.textAlign === "center" ? width / 2 : 0);
      window.receivingCanvasText ??= [];
      window.receivingCanvasText.push({ text, left, right: left + width, top: y - measured.actualBoundingBoxAscent, bottom: y + measured.actualBoundingBoxDescent });
      return fillText.call(this,text,x,y,maxWidth);
    };
  }));
  try {
    const layouts = [];
    for (const width of [320, 360, 390, 680, 1280]) {
      await page.setViewportSize({ width, height: 768 });
      // The browser's resize listener redraws the real canvas. Waiting for its
      // dimensions avoids inspecting the prior frame after a viewport change.
      await page.waitForFunction(() => Math.abs(document.querySelector("#game").width / Math.min(2,devicePixelRatio) - document.querySelector("#game").getBoundingClientRect().width) < 1);
      const labels = await page.evaluate(() => window.receivingCanvasText.filter(item => /^(LONGWATER|FOURTEEN TIDES|WATER |SEED |↻)/.test(item.text)));
      assert.equal(labels.length, 5, "all five header labels are present in the actual canvas draw");
      for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i], b = labels[j];
        const overlap = Math.min(a.right,b.right) > Math.max(a.left,b.left) && Math.min(a.bottom,b.bottom) > Math.max(a.top,b.top);
        assert.equal(overlap, false, `${width}px: ${a.text} overlaps ${b.text}: ${JSON.stringify({a,b})}`);
      }
      layouts.push({ width, labels });
    }
    await writeFile(resolve(evidenceRoot,"header-layouts.json"), JSON.stringify(layouts,null,2) + "\n");
    assert.deepEqual(errors, []);
  } finally { await close(); }
});

test("canvas admission failure remains visible, names the reason and never enables a game control", async () => {
  const { page, errors, close } = await open({}, page => page.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; }));
  try {
    assert.match(await page.locator("#live").textContent(), /could not start.*cannot create the game canvas/);
    await page.locator("#startup-error").waitFor({ state: "visible" });
    assert.equal(await page.locator(".game-control").count(), 7);
    assert.equal(await page.locator(".game-control").evaluateAll(els => els.every(el => el.disabled)), true);
    assert.deepEqual(errors, []);
  } finally { await close(); }
});
