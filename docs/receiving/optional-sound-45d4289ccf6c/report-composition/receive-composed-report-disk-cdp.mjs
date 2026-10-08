#!/usr/bin/env node
// Bounded receiving of opt-in sound composed with landed readable report e4e9. Existing Chromium + Node only.
// Original audio/core and reset acceptance remain frozen; this tests real report-download coexistence only.
// Transport adapted from the already-qualified RecallWeave receiver ab7be4320ecb...
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, writeFile, mkdir, mkdtemp, rm, rmdir, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
const args = process.argv.slice(2);
const opt = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const root = resolve(opt("--root", "/home/jacob/longwater-sound-45d4289ccf6c/final-qualified"));
const source = resolve(opt("--source", join(root, "source")));
const output = resolve(opt("--output", join(root, "evidence/composed-report")));
const tempRoot = resolve(opt("--temporary-root", "/home/jacob/lw45-r"));
const executable = opt("--browser", "/snap/chromium/3537/usr/lib/chromium-browser/chrome");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function hashFile(path) { const h = createHash("sha256"); for await (const chunk of createReadStream(path)) h.update(chunk); return h.digest("hex"); }
await mkdir(output, { recursive: true }); await mkdir(tempRoot, { recursive: false });
const custody = JSON.parse(await readFile(join(root, "report-composition-custody.json"), "utf8"));
const report = { schema: "longwater.optional-sound.landed-report.native-cdp.v1", status: "running", at: new Date().toISOString(), source, sourceCustodySha256: sha(await readFile(join(root, "report-composition-custody.json"))), base: custody.base, baseTree: custody.base_tree, originalAudioCommit: custody.original_audio_commit, prospectiveTree: custody.prospective_tree, runtime: { node: process.version, nodePath: process.execPath, browserPath: executable, browserSha256: await hashFile(executable), dependencyInstall: false, profileRoot: tempRoot, transportProvenance: "/home/jacob/recallweave-binary-learner-45d4289ccf6c/packet/receive-binary-course.mjs at ab7be4320ecb22777778fbd06f4414a8165144dca28520245df67d324e4e7568" }, groups: [], errors: [], requests: [], downloadEvents: [], sourceBefore: {}, sourceAfter: {}, cleanup: {} };
for (const [name, expected] of Object.entries(custody.source_sha256)) {
  report.sourceBefore[name] = await hashFile(join(source, name)); assert.equal(report.sourceBefore[name], expected, name);
}
const { serve } = await import(pathToFileURL(join(source, "tests/server.mjs")));
let server, browser, browserExit, profile, socket, sessionId;
let sequence = 0, browserLog = "";
const pending = new Map(), contexts = new Set();
async function waitFor(fn, label) {
  let last; for (let i = 0; i < 100; i++) { try { if (await fn()) return; } catch (e) { last = e; } await sleep(80); }
  throw new Error("Timed out: " + label + (last ? " (" + last.message + ")" : ""));
}
function command(method, params = {}, scoped = true) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("CDP timeout " + method)); }, 10000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params, ...(scoped && sessionId ? { sessionId } : {}) }));
  });
}
async function evaluate(expression) {
  const r = await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
const page = (fn, ...values) => evaluate("(" + fn.toString() + ")(" + values.map(v => JSON.stringify(v)).join(",") + ")");
async function click(selector) {
  const point = await page(s => {
    const el = document.querySelector(s); if (!el) throw new Error("Missing " + s);
    el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, selector);
  await command("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", buttons: 1, clickCount: 1 });
  await command("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", buttons: 0, clickCount: 1 });
}
const state = () => page(() => ({
  summary: document.querySelector("#state-summary").textContent,
  cells: [0, 1, 2].map(i => document.querySelector("#cell-" + i + "-readings").textContent),
  selected: [...document.querySelectorAll("[data-cell]")].map(el => el.getAttribute("aria-pressed")),
  report: document.querySelector("#report-lines").textContent,
  journal: document.querySelector("#journal-entries")?.textContent || "",
  saved: Object.fromEntries(Object.entries(localStorage)),
}));
const audio = () => page(() => ({ status: document.querySelector("#sound-status").textContent, checked: document.querySelector("#sound-enabled").checked, contexts: window.__audio.contexts.map(c => c.state), starts: window.__audio.starts }));
function inject(mode) {
  const Native = globalThis.AudioContext;
  window.__audio = { contexts: [], starts: [], defer: mode === "deferred" };
  if (mode === "absent") { globalThis.AudioContext = undefined; globalThis.webkitAudioContext = undefined; return; }
  globalThis.AudioContext = class extends Native {
    constructor(...args) {
      if (mode === "constructor-blocked") throw new DOMException("Fixture audio policy block", "NotAllowedError");
      super(...args); this.testId = window.__audio.contexts.length; window.__audio.contexts.push(this);
    }
    createOscillator() {
      const oscillator = super.createOscillator(), start = oscillator.start.bind(oscillator);
      oscillator.start = at => { window.__audio.starts.push({ context: this.testId, at, type: oscillator.type }); return start(at); }; return oscillator;
    }
    resume() {
      if (mode === "resume-rejected") return Promise.reject(new DOMException("Fixture resume rejection", "NotAllowedError"));
      const native = super.resume();
      if (mode === "resume-timeout") { native.catch(() => {}); return new Promise(() => {}); }
      if (window.__audio.defer) return new Promise((resolve, reject) => { native.then(() => { window.__audio.settle = resolve; }, reject); });
      return native;
    }
  };
}
async function open(mode = "native", offline = false, width = 1280, downloadPath) {
  const { browserContextId } = await command("Target.createBrowserContext", {}, false); contexts.add(browserContextId);
  assert.ok(downloadPath, "explicit owned report-download destination required");
  await command("Browser.setDownloadBehavior", { behavior: "allow", browserContextId, downloadPath, eventsEnabled: true }, false);
  const { targetId } = await command("Target.createTarget", { url: "about:blank", browserContextId }, false);
  ({ sessionId } = await command("Target.attachToTarget", { targetId, flatten: true }, false));
  for (const method of ["Page.enable", "Runtime.enable", "Network.enable"]) await command(method);
  await command("Emulation.setDeviceMetricsOverride", { width, height: width < 680 ? 568 : 900, deviceScaleFactor: 1, mobile: width < 680 });
  await command("Page.addScriptToEvaluateOnNewDocument", { source: "(" + inject.toString() + ")(" + JSON.stringify(mode) + ")" });
  if (offline) await command("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  const url = offline ? pathToFileURL(join(source, "downloads/Longwater-Fourteen-Tides.html")).href : server.url;
  await command("Page.navigate", { url });
  await waitFor(() => page(() => /^Day 0 of 14/.test(document.querySelector("#state-summary")?.textContent) && !document.querySelector("#sound-enabled").disabled), "actual WASM opening");
  return async () => { await command("Target.disposeBrowserContext", { browserContextId }, false); contexts.delete(browserContextId); sessionId = undefined; };
}
async function enable() { await click("#sound-enabled"); await waitFor(() => page(() => document.querySelector("#sound-status").textContent === "On"), "explicit sound ready"); }
async function off() { await waitFor(() => page(() => !document.querySelector("#sound-enabled").checked && window.__audio.contexts.every(c => c.state === "closed")), "audio closed"); }
async function group(name, details) { report.groups.push({ name, status: "passed", ...details }); console.log("PASS " + name); }
try {
  profile = await mkdtemp(join(tempRoot, "p-")); server = await serve();
  browser = spawn(executable, ["--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--disable-background-networking", "--disable-component-update", "--disable-sync", "--disable-extensions", "--disable-breakpad", "--no-first-run", "--no-default-browser-check", "--mute-audio", "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", "--user-data-dir=" + profile, "about:blank"], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, TMPDIR: profile } });
  browser.stderr.on("data", d => { browserLog = (browserLog + d).slice(-16000); }); browser.stdout.on("data", d => { browserLog = (browserLog + d).slice(-16000); });
  browser.on("exit", (code, signal) => { browserExit = { code, signal }; });
  let endpoint; await waitFor(async () => { if (browserExit) throw new Error("Browser exited " + JSON.stringify(browserExit)); const lines = (await readFile(join(profile, "DevToolsActivePort"), "utf8")).trim().split("\n"); endpoint = "ws://127.0.0.1:" + lines[0] + lines[1]; return true; }, "DevTools endpoint");
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  socket.addEventListener("message", event => {
    const m = JSON.parse(String(event.data));
    if (m.id) { const p = pending.get(m.id); if (p) { clearTimeout(p.timer); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } return; }
    if (m.method === "Browser.downloadWillBegin" || m.method === "Browser.downloadProgress") report.downloadEvents.push({ method: m.method, ...m.params });
    if (m.method === "Runtime.exceptionThrown") report.errors.push(m.params.exceptionDetails);
    if (m.method === "Network.requestWillBeSent") report.requests.push({ session: m.sessionId, url: m.params.request.url.startsWith("data:") ? "data:[sha256:" + sha(m.params.request.url) + ";chars:" + m.params.request.url.length + "]" : m.params.request.url });
  });
  report.runtime.browser = await command("Browser.getVersion", {}, false);
  for (const variant of [{ name: "desktop-http", offline: false, width: 1280 }, { name: "offline-320", offline: true, width: 320 }]) {
    const downloadPath = join(tempRoot, variant.name + "-downloads");
    await mkdir(downloadPath);
    const close = await open("native", variant.offline, variant.width, downloadPath);
    try {
      const opening = await state(), openingAudio = await audio();
      assert.equal(openingAudio.checked, false);
      assert.equal(openingAudio.contexts.length, 0);
      assert.equal(await page(() => document.querySelector("#watch-report-download").disabled), true, "opening cannot download a stale report");
      await enable();
      assert.deepEqual(await state(), opening, "explicit opt-in preserves the opening watch");
      assert.equal((await audio()).starts.length, 1);
      await click('[data-action="gate"]');
      const progressed = await state(), acceptedAudio = await audio();
      assert.match(progressed.summary, /^Day 1 of 14/);
      assert.equal(acceptedAudio.starts.length, 3, "ready and accepted Gate cue");
      assert.equal(await page(() => document.querySelector("#watch-report-download").disabled), false);
      const eventStart = report.downloadEvents.length;
      await click("#watch-report-download");
      await waitFor(() => report.downloadEvents.slice(eventStart).some(e => e.method === "Browser.downloadProgress" && e.state === "completed"), "actual report download completed");
      const begin = report.downloadEvents.slice(eventStart).find(e => e.method === "Browser.downloadWillBegin");
      assert.equal(begin?.suggestedFilename, "Longwater-watch-tide-01.html");
      const downloadedNames = await readdir(downloadPath);
      assert.deepEqual(downloadedNames, ["Longwater-watch-tide-01.html"], "exactly one real report in our explicit destination");
      const reportFile = join(downloadPath, downloadedNames[0]);
      const downloaded = await readFile(reportFile);
      const staticReport = await page(html => {
        const doc = new DOMParser().parseFromString(html, "text/html");
        return {
          title: doc.title, status: doc.querySelector("#report-status")?.textContent.trim(),
          tides: [...doc.querySelectorAll(".tide")].map(el => ({ tide: el.dataset.tide, heading: el.querySelector("h2")?.textContent.trim() })),
          forbiddenElements: doc.querySelectorAll("script,iframe,form,img,link,object").length
        };
      }, downloaded.toString("utf8"));
      assert.equal(staticReport.title, "Longwater watch report");
      assert.equal(staticReport.status, "Partial watch · 1 of 14 tides completed");
      assert.deepEqual(staticReport.tides, [{ tide: "1", heading: "Tide 1 · Gate · Heart Pool" }]);
      assert.equal(staticReport.forbiddenElements, 0);
      assert.deepEqual(await state(), progressed, "real report download preserves exact simulation, journal and saved bytes");
      assert.deepEqual(await audio(), acceptedAudio, "report download neither cues nor closes opted-in audio");
      assert.match(await page(() => document.querySelector("#watch-report-status").textContent), /Report download requested for tide 1 of 14\. Your watch is unchanged\./);
      await click('[data-action="shade"]');
      const continued = await state(), continuedAudio = await audio();
      assert.match(continued.summary, /^Day 2 of 14/);
      assert.equal(continuedAudio.starts.length, 5, "accepted Shade still cues after actual download");
      assert.deepEqual(JSON.parse(continued.saved["longwater.watch.v1"]).turns, [{ action: "gate", cell: "heart" }, { action: "shade", cell: "heart" }]);
      assert.equal(await hashFile(reportFile), sha(downloaded), "downloaded one-tide report stays exact after watch continues");
      assert.equal(report.downloadEvents.slice(eventStart).filter(e => e.method === "Browser.downloadWillBegin").length, 1, "continued play does not create another download");
      const geometry = await page(() => {
        const bounds = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width, height: r.height }; };
        return { viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, sound: bounds(".watch-audio label"), report: bounds("#watch-report-download") };
      });
      assert.ok(geometry.documentWidth <= variant.width, "no horizontal overflow");
      for (const r of [geometry.sound, geometry.report]) assert.ok(r.left >= 0 && r.right <= variant.width && r.height >= 44, "sound and report controls remain readable and operable");
      await page(() => { document.activeElement?.blur(); scrollTo(0, 0); }); await sleep(100);
      const metrics = await command("Page.getLayoutMetrics"), size = metrics.cssContentSize || metrics.contentSize;
      const shot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: Math.ceil(size.width), height: Math.ceil(size.height), scale: 1 } });
      const png = Buffer.from(shot.data, "base64");
      await writeFile(join(output, variant.name + "-sound-and-report.png"), png);
      await writeFile(join(output, variant.name + "-downloaded-report.html"), downloaded);
      const trace = { opening, openingAudio, progressed, acceptedAudio, staticReport, continued, continuedAudio, download: { filename: begin.suggestedFilename, bytes: downloaded.length, sha256: sha(downloaded) }, geometry };
      const bytes = Buffer.from(JSON.stringify(trace, null, 2) + "\n");
      await writeFile(join(output, variant.name + "-state-custody.json"), bytes);
      await group(variant.name + " real report download preserves opted-in sound and watch", { acceptedTurns: 2, actualDownloads: 1, nativeAudioContext: true, gameStateAndSaveUnchangedByDownload: true, optedInContextAndCueCountUnchangedByDownload: true, nextAcceptedTurnCued: true, downloadedReportRemainsImmutableAfterContinuation: true, downloadedReportSha256: sha(downloaded), stateCustodySha256: sha(bytes), screenshotSha256: sha(png), geometry });
    } finally { await close(); await rm(downloadPath, { recursive: true, force: true }); }
  }
  assert.deepEqual(report.errors, []);
  const localOrigin = new URL(server.url).origin;
  assert.ok(report.requests.every(r => r.url.startsWith("data:") || r.url.startsWith("file:") || r.url.startsWith("about:") || r.url.startsWith("blob:") || new URL(r.url).origin === localOrigin), "No external page request");
  report.status = "passed";
} catch (error) { report.status = "failed"; report.failure = { message: error.message, stack: error.stack }; console.error(error.stack); }
finally {
  for (const id of contexts) { try { await command("Target.disposeBrowserContext", { browserContextId: id }, false); } catch {} }
  if (socket?.readyState === 1) { try { await command("Browser.close", {}, false); } catch {} }
  if (browser && !browserExit) { await sleep(500); if (!browserExit) browser.kill("SIGTERM"); await sleep(700); if (!browserExit) browser.kill("SIGKILL"); await sleep(300); }
  socket?.close();
  for (const p of pending.values()) clearTimeout(p.timer);
  report.cleanup.browserExit = browserExit || null;
  if (server) { await server.close(); report.cleanup.serverClosed = true; }
  if (profile && browserExit) { await rm(profile, { recursive: true, force: true }); report.cleanup.ownProfileRemoved = true; }
  report.cleanup.tempEntries = await readdir(tempRoot);
  if (!report.cleanup.tempEntries.length) { await rmdir(tempRoot); report.cleanup.ownTempRootRemoved = true; }
  for (const [name, expected] of Object.entries(custody.source_sha256)) { report.sourceAfter[name] = await hashFile(join(source, name)); if (report.sourceAfter[name] !== expected) report.status = "failed"; }
  report.cleanup.sourceUnchanged = JSON.stringify(report.sourceAfter) === JSON.stringify(report.sourceBefore);
  if (!browserExit || !report.cleanup.sourceUnchanged || report.cleanup.tempEntries.length) report.status = "failed";
  report.finished = new Date().toISOString(); report.receiverSha256 = sha(await readFile(new URL(import.meta.url)));
  await writeFile(join(output, "browser.log"), browserLog); const bytes = Buffer.from(JSON.stringify(report, null, 2) + "\n"); await writeFile(join(output, "receipt.json"), bytes);
  console.log(JSON.stringify({ status: report.status, groups: report.groups.length, receiptSha256: sha(bytes), output, cleanup: report.cleanup }));
  process.exitCode = report.status === "passed" ? 0 : 1;
}
