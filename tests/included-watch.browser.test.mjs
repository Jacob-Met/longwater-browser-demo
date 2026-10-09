import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";

const project = resolve(process.env.LONGWATER_SOURCE_ROOT ?? fileURLToPath(new URL("..", import.meta.url)));
const work = await mkdtemp(resolve(tmpdir(), "longwater-included-watch-"));
const { default: init, BrowserSession } = await import(pathToFileURL(resolve(project, "pkg/longwater_web.js")));
const { SavedWatch } = await import(pathToFileURL(resolve(project, "watch-save.js")));
await init({ module_or_path: await readFile(resolve(project, "pkg/longwater_web_bg.wasm")) });
function nativeWatch(actions, selected) {
  let saved = null;
  const watch = new SavedWatch({ createSession: () => new BrowserSession(),
    getStorage: () => ({ getItem: () => saved, setItem(_key, value) { saved = value; } }) });
  try {
    for (const [cell, action] of actions) { watch.select(cell); watch.takeTurn(action); }
    watch.select(selected);
    return watch.exportFile();
  } finally { watch.free(); }
}
const donor = nativeWatch([[0, "shade"], [1, "shade"], [2, "shade"]], 2);
const recipient = nativeWatch([[0, "gate"]], 0);
const exactWatch = JSON.stringify(JSON.parse(donor), null, 2) + "\n";
const name = 'Watch " & <img src=x onerror="globalThis.__includedWatchInjected=1">.json';
const input = resolve(work, name), output = resolve(work, "review-this-watch.html");
await writeFile(input, exactWatch);
let browser;

before(async () => {
  const packed = spawnSync(process.execPath, [resolve(project, "scripts/package-watch.mjs"), input, "--output", output],
    { cwd: project, encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024 });
  assert.equal(packed.error, undefined);
  assert.equal(packed.status, 0, packed.stderr);
  await mkdir(resolve(work, "downloads"));
  browser = await chromium.launch({
    headless: true,
    timeout: 30000,
    ...(process.env.LONGWATER_BROWSER ? { executablePath: process.env.LONGWATER_BROWSER } : {}),
    downloadsPath: resolve(work, "downloads"),
    args: ["--no-sandbox"],
  });
});
after(async () => { await browser?.close(); });

async function contextWithExistingWatch(options = {}) {
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 390, height: 844 } });
  await context.addInitScript(({ existing, delay, startupFailure, capability }) => {
    const key = "longwater.watch.v1";
    if (localStorage.getItem(key) === null) localStorage.setItem(key, existing);
    globalThis.__watchWrites = [];
    globalThis.__fileReads = [];
    globalThis.__wasmStarts = 0;
    globalThis.__includedWatchInjected = false;
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) globalThis.__watchWrites.push(String(value));
      return set.call(this, name, value);
    };
    const text = File.prototype.text;
    File.prototype.text = async function () {
      const raw = await text.call(this);
      globalThis.__fileReads.push({ name: this.name, raw });
      return raw;
    };
    const instantiate = WebAssembly.instantiate;
    WebAssembly.instantiate = async function (...args) {
      globalThis.__wasmStarts++;
      if (delay) await new Promise(resolve => { globalThis.__releaseWasm = resolve; });
      return instantiate.apply(this, args);
    };
    if (startupFailure) {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (...args) {
        return this.id === "game" ? null : getContext.apply(this, args);
      };
    }
    if (capability === "missing-datatransfer") Object.defineProperty(globalThis, "DataTransfer", { value: undefined, configurable: true });
    if (capability === "throwing-datatransfer") Object.defineProperty(globalThis, "DataTransfer", { value: class { constructor() { throw new Error("Fixture DataTransfer refusal"); } }, configurable: true });
    if (capability === "missing-file") Object.defineProperty(globalThis, "File", { value: undefined, configurable: true });
  }, { existing: recipient, delay: false, startupFailure: false, capability: null, ...options });
  const page = await context.newPage();
  const errors = [], external = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("request", request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
  return { context, page, errors, external };
}
const readStored = page => page.evaluate(() => localStorage.getItem("longwater.watch.v1"));
const reads = page => page.evaluate(() => globalThis.__fileReads);
const writes = page => page.evaluate(() => globalThis.__watchWrites);
const review = page => page.getByRole("button", { name: "Review included watch", exact: true });
async function ready(page) {
  await page.goto(pathToFileURL(output).href);
  await page.locator("#watch-file-open").waitFor({ state: "visible" });
  await page.waitForFunction(() => !document.querySelector("#watch-file-open").disabled);
  await page.waitForFunction(() => !document.querySelector("#included-watch-review").disabled);
}
async function downloadedWatch(page) {
  const event = page.waitForEvent("download");
  await page.locator("#watch-file-download").click();
  const download = await event;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  assert.equal(await download.failure(), null);
  return Buffer.concat(chunks).toString("utf8");
}

test("top-level-await startup is completed once before the included review is enabled", async () => {
  const { context, page, errors, external } = await contextWithExistingWatch({ delay: true });
  try {
    await page.goto(pathToFileURL(output).href, { waitUntil: "commit" });
    await page.locator("#included-watch-review").waitFor();
    await page.waitForFunction(() => typeof globalThis.__releaseWasm === "function");
    assert.equal(await review(page).isDisabled(), true);
    assert.equal(await readStored(page), recipient);
    assert.deepEqual(await writes(page), []);
    await page.evaluate(() => globalThis.__releaseWasm());
    await page.waitForFunction(() => !document.querySelector("#included-watch-review").disabled);
    assert.equal(await page.evaluate(() => globalThis.__wasmStarts), 1);
    assert.equal(await readStored(page), recipient);
    assert.deepEqual(await reads(page), []);
    assert.deepEqual(await writes(page), []);
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  } finally { await context.close(); }
});

test("direct-file recipient explicitly previews, cancels, replaces, reopens and continues the exact included watch", async () => {
  const { context, page, errors, external } = await contextWithExistingWatch();
  try {
    await ready(page);
    assert.equal(await downloadedWatch(page), recipient);
    assert.equal(await readStored(page), recipient);
    assert.deepEqual(await writes(page), []);
    await review(page).focus();
    await page.keyboard.press("Enter");
    await page.locator("#watch-file-preview").waitFor({ state: "visible" });
    assert.equal(await page.locator("#watch-file-preview-title").textContent(), "Open " + name + "?");
    assert.match(await page.locator("#watch-file-summary").textContent(), /Day 3 of 14/);
    assert.deepEqual(await reads(page), [{ name, raw: exactWatch }]);
    assert.equal(await downloadedWatch(page), recipient);
    assert.equal(await readStored(page), recipient);
    assert.deepEqual(await writes(page), []);
    await page.locator("#watch-file-cancel").click();
    assert.equal(await page.locator("#watch-file-preview").isVisible(), false);
    assert.equal(await readStored(page), recipient);
    assert.deepEqual(await writes(page), []);
    await review(page).click();
    await page.locator("#watch-file-preview").waitFor({ state: "visible" });
    await page.locator("#watch-file-confirm").click();
    await page.waitForFunction(() => document.querySelector("#watch-file-status").textContent.includes("Opened day 3"));
    assert.equal(await downloadedWatch(page), donor);
    assert.equal(await readStored(page), donor);
    assert.deepEqual(await writes(page), [donor]);
    assert.equal(await page.evaluate(() => globalThis.__includedWatchInjected), false);
    assert.equal(await page.locator("img").count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.reload();
    await page.waitForFunction(() => !document.querySelector("#included-watch-review").disabled);
    assert.equal(await downloadedWatch(page), donor);
    assert.deepEqual(await writes(page), [], "reopening does not re-adopt or rewrite the included watch");
    await page.locator('[data-action="shade"]').click();
    const continued = JSON.parse(await downloadedWatch(page));
    assert.equal(continued.turns.length, 4);
    assert.deepEqual(continued.turns.slice(0, 3), JSON.parse(donor).turns);
    assert.equal(continued.selected, "south");
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  } finally { await context.close(); }
});

test("a caught inherited game-start failure cannot enable included review or mutate recipient storage", async () => {
  const { context, page, errors, external } = await contextWithExistingWatch({ startupFailure: true });
  try {
    await page.goto(pathToFileURL(output).href);
    await page.locator("#startup-error").waitFor({ state: "visible" });
    await page.waitForFunction(() => /could not|unavailable|start/i.test(document.querySelector("#included-watch-status").textContent));
    assert.equal(await review(page).isDisabled(), true);
    assert.equal(await readStored(page), recipient);
    assert.deepEqual(await writes(page), []);
    assert.deepEqual(await reads(page), []);
    assert.equal(await page.locator("#watch-file-preview").isVisible(), false);
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  } finally { await context.close(); }
});

test("missing or refusing File/DataTransfer stays honest and preserves the ordinary recipient game", async t => {
  for (const capability of ["missing-datatransfer", "throwing-datatransfer", "missing-file"]) await t.test(capability, async () => {
    const { context, page, errors } = await contextWithExistingWatch({ capability });
    try {
      await page.goto(pathToFileURL(output).href);
      await page.waitForFunction(() => !document.querySelector("#watch-file-open").disabled);
      await review(page).waitFor();
      if (await review(page).isEnabled()) await review(page).click();
      await page.waitForFunction(() => /could not|unavailable|support|cannot/i.test(document.querySelector("#included-watch-status").textContent));
      assert.equal(await readStored(page), recipient);
      assert.deepEqual(await writes(page), []);
      assert.equal(await page.locator("#watch-file-preview").isVisible(), false);
      assert.equal(await page.locator("#watch-file-open").isEnabled(), true);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
});

test("a browser refusal while assigning a FileList preserves an already pending manual-file review", async () => {
  const { context, page, errors } = await contextWithExistingWatch();
  try {
    await ready(page);
    await page.locator("#watch-file-input").setInputFiles({ name: "manual-watch.json", mimeType: "application/json", buffer: Buffer.from(donor) });
    await page.locator("#watch-file-preview").waitFor({ state: "visible" });
    const title = await page.locator("#watch-file-preview-title").textContent();
    await page.evaluate(() => {
      const original = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "files");
      Object.defineProperty(HTMLInputElement.prototype, "files", {
        configurable: true, get: original.get,
        set() { throw new Error("Fixture FileList assignment refusal"); },
      });
    });
    await review(page).click();
    await page.waitForFunction(() => /could not|unavailable|support|cannot/i.test(document.querySelector("#included-watch-status").textContent));
    assert.equal(await page.locator("#watch-file-preview").isVisible(), true);
    assert.equal(await page.locator("#watch-file-preview-title").textContent(), title);
    assert.equal(await readStored(page), recipient);
    assert.deepEqual(await writes(page), []);
    await page.locator("#watch-file-cancel").click();
    assert.equal(await readStored(page), recipient);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
