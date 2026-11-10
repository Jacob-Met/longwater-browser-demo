import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { serve } from "./server.mjs";

let browser, server;
const output = resolve(process.env.LONGWATER_SOUND_OUTPUT || "test-results/sound");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
before(async () => {
  await mkdir(output, { recursive: true });
  server = await serve();
  browser = await chromium.launch({ headless: true, executablePath: process.env.LONGWATER_CHROME_PATH || undefined });
});
after(async () => { await browser?.close(); await server?.close(); });

async function open({ mode = "native", offline = false, viewport = { width: 1280, height: 900 }, startupFailure = false } = {}) {
  const context = await browser.newContext({ viewport, offline, isMobile: viewport.width < 680, hasTouch: viewport.width < 680 });
  await context.addInitScript(mode => {
    const Native = globalThis.AudioContext;
    window.__audio = { contexts: [], starts: [], resumeCalls: 0 };
    if (mode === "absent") {
      globalThis.AudioContext = undefined;
      globalThis.webkitAudioContext = undefined;
      return;
    }
    globalThis.AudioContext = class extends Native {
      constructor(...args) {
        if (mode === "constructor-blocked") throw new DOMException("Fixture audio policy block", "NotAllowedError");
        super(...args);
        this.testId = window.__audio.contexts.length;
        window.__audio.contexts.push(this);
      }
      createOscillator() {
        const oscillator = super.createOscillator();
        const start = oscillator.start.bind(oscillator);
        oscillator.start = at => { window.__audio.starts.push({ context: this.testId, at, type: oscillator.type }); return start(at); };
        return oscillator;
      }
      resume() {
        window.__audio.resumeCalls++;
        if (mode === "resume-rejected") return Promise.reject(new DOMException("Fixture resume rejection", "NotAllowedError"));
        const result = super.resume();
        if (mode === "resume-timeout") { result.catch(() => {}); return new Promise(() => {}); }
        return result;
      }
    };
  }, mode);
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  const errors = [], external = [];
  page.on("pageerror", error => errors.push(error.message));
  const url = offline ? pathToFileURL(resolve("downloads/Longwater-Fourteen-Tides.html")).href : server.url;
  context.on("request", request => {
    const u = request.url();
    if (offline ? u !== url && !u.startsWith("data:") : /^https?:/.test(u) && !u.startsWith(server.url + "/") && u !== server.url) external.push(u);
  });
  if (startupFailure) await page.route("**/*.wasm", route => route.abort());
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector("#live")?.textContent !== "Loading Longwater…");
  return { page, errors, external, async close() { await context.close(); assert.deepEqual(errors, []); assert.deepEqual(external, []); } };
}

const state = page => page.evaluate(() => ({
  summary: document.querySelector("#state-summary").textContent,
  cells: [0, 1, 2].map(i => document.querySelector("#cell-" + i + "-readings").textContent),
  selected: [...document.querySelectorAll("[data-cell]")].map(el => el.getAttribute("aria-pressed")),
  report: document.querySelector("#report-lines").textContent,
  journal: document.querySelector("#journal-entries")?.textContent || "",
  saved: Object.fromEntries(Object.entries(localStorage)),
}));
const probe = page => page.evaluate(() => ({
  contexts: window.__audio.contexts.map(c => c.state),
  starts: window.__audio.starts,
  resumeCalls: window.__audio.resumeCalls,
}));
const sound = page => page.getByRole("switch", { name: "Sound cues" });
async function enable(page) {
  await sound(page).check();
  await page.waitForFunction(() => document.querySelector("#sound-status").textContent === "On");
}
async function settledOff(page) {
  await page.waitForFunction(() => window.__audio.contexts.every(c => c.state === "closed"));
  assert.equal(await sound(page).isChecked(), false);
}
async function artifact(name, value) {
  await writeFile(resolve(output, name), JSON.stringify(value, null, 2) + "\n");
}

test("opening and resuming remain silent until explicit keyboard opt-in", async () => {
  const h = await open();
  try {
    assert.equal(await sound(h.page).isChecked(), false);
    assert.equal(await sound(h.page).isDisabled(), false);
    assert.deepEqual((await probe(h.page)).contexts, []);
    await h.page.getByRole("button", { name: /^Gate/ }).click();
    const before = await state(h.page);
    assert.match(before.summary, /^Day 1 of 14/);
    assert.deepEqual((await probe(h.page)).contexts, []);
    await sound(h.page).focus();
    await h.page.keyboard.press("Space");
    await h.page.waitForFunction(() => document.querySelector("#sound-status").textContent === "On");
    assert.deepEqual(await state(h.page), before);
    assert.deepEqual((await probe(h.page)).contexts, ["running"]);
    assert.equal((await probe(h.page)).starts.length, 1, "one quiet ready cue confirms explicit enable");
    await h.page.keyboard.press("r");
    assert.deepEqual(await state(h.page), before, "game shortcuts do not run from the separate sound control");
    await h.page.reload();
    await h.page.waitForFunction(() => /^Day 1/.test(document.querySelector("#state-summary")?.textContent));
    assert.deepEqual(await state(h.page), before);
    assert.equal(await sound(h.page).isChecked(), false);
    assert.deepEqual((await probe(h.page)).contexts, [], "resuming never autoplays");
  } finally { await h.close(); }
});

test("only accepted turns make action cues; rejected and unavailable turns remain silent", async () => {
  const h = await open();
  try {
    await enable(h.page);
    const trace = [];
    for (const [action, voices] of [["Gate", 2], ["Seed", 3], ["Shade", 2]]) {
      const before = await probe(h.page);
      await h.page.getByRole("button", { name: new RegExp("^" + action) }).click();
      const after = await probe(h.page);
      assert.equal(after.starts.length - before.starts.length, voices);
      trace.push({ action, voices, game: await state(h.page) });
    }
    const shade = h.page.getByRole("button", { name: /^Shade/ });
    while (await shade.getAttribute("aria-disabled") !== "true") await shade.click();
    const beforeUnavailable = await state(h.page), beforeAudio = await probe(h.page);
    await shade.press("Enter");
    assert.deepEqual(await state(h.page), beforeUnavailable);
    assert.equal((await probe(h.page)).starts.length, beforeAudio.starts.length);
    assert.match(await h.page.locator("#live").textContent(), /canopy/i);
    await h.page.evaluate(async () => {
      const { BrowserSession } = await import("./pkg/longwater_web.js");
      window.__originalTakeTurn = BrowserSession.prototype.take_turn;
      if (typeof window.__originalTakeTurn !== "function") throw new Error("Native take_turn interface missing");
      BrowserSession.prototype.take_turn = function () { throw new Error("Fixture turn refusal"); };
    });
    const beforeRefusal = await state(h.page);
    await h.page.getByRole("button", { name: /^Gate/ }).click();
    assert.deepEqual(await state(h.page), beforeRefusal);
    assert.equal((await probe(h.page)).starts.length, beforeAudio.starts.length);
    assert.match(await h.page.locator("#live").textContent(), /Fixture turn refusal/);
    await artifact("accepted-turns.json", { trace, unavailable: beforeUnavailable, refused: beforeRefusal, audio: await probe(h.page), faultInjection: "Only the isolated browser's native wrapper method was replaced to exercise an existing failed-turn branch; source/WASM bytes were unchanged." });
  } finally { await h.close(); }
});

async function finish(page) {
  const trace = [];
  for (let tide = 1; tide <= 14; tide++) {
    let action;
    for (let cell = 0; cell < 3 && !action; cell++) {
      await page.getByRole("button", { name: new RegExp("^Cell " + (cell + 1) + ":") }).click();
      const shade = page.getByRole("button", { name: /^Shade/ });
      if (await shade.getAttribute("aria-disabled") !== "true") { await shade.click(); action = "shade"; }
    }
    if (!action) for (const name of ["Gate", "Seed"]) {
      const button = page.getByRole("button", { name: new RegExp("^" + name) });
      if (await button.getAttribute("aria-disabled") !== "true") { await button.click(); action = name.toLowerCase(); break; }
    }
    assert.ok(action, "an actual available action exists before the watch ends");
    const current = await state(page);
    assert.match(current.summary, new RegExp("^Day " + tide + " of 14"));
    trace.push({ action, current });
  }
  assert.match(trace.at(-1).current.summary, /Watch closed/);
  return trace;
}

test("all fourteen actual WASM states and saved bytes match with sound off, on, or blocked", async () => {
  const traces = {};
  for (const mode of ["off", "on", "blocked"]) {
    const h = await open({ mode: mode === "blocked" ? "constructor-blocked" : "native" });
    try {
      if (mode === "on") await enable(h.page);
      if (mode === "blocked") {
        await sound(h.page).click();
        await h.page.waitForFunction(() => /unavailable/.test(document.querySelector("#sound-status").textContent));
      }
      traces[mode] = await finish(h.page);
      const audio = await probe(h.page);
      if (mode === "on") {
        const expected = 1 + traces.on.slice(0, -1).reduce((n, step) => n + (step.action === "seed" ? 3 : 2), 0) + 3;
        assert.equal(audio.starts.length, expected, "the final accepted turn plays the closing chord");
        const before = audio.starts.length;
        await h.page.getByRole("button", { name: /^Gate/ }).press("Space");
        assert.equal((await probe(h.page)).starts.length, before, "a completed watch makes no additional cue");
      } else assert.equal(audio.starts.length, 0);
    } finally { await h.close(); }
  }
  assert.deepEqual(traces.on, traces.off);
  assert.deepEqual(traces.blocked, traces.off);
  await artifact("fourteen-tide-parity.json", traces);
});

test("mute and real native audio suspension close sound without changing the watch", async () => {
  const h = await open();
  try {
    await enable(h.page);
    await h.page.getByRole("button", { name: /^Seed/ }).click();
    const before = await state(h.page);
    await sound(h.page).uncheck();
    await settledOff(h.page);
    assert.deepEqual(await state(h.page), before);
    const audio = await probe(h.page);
    await h.page.getByRole("button", { name: /^Gate/ }).click();
    assert.equal((await probe(h.page)).starts.length, audio.starts.length);
    await enable(h.page);
    const preSuspend = await state(h.page);
    await h.page.evaluate(() => window.__audio.contexts.at(-1).suspend());
    await h.page.waitForFunction(() => /paused/.test(document.querySelector("#sound-status").textContent));
    await settledOff(h.page);
    assert.deepEqual(await state(h.page), preSuspend);
    await artifact("mute-and-native-suspension.json", { before, preSuspend, audio: await probe(h.page) });
  } finally { await h.close(); }
});

test("unavailable, blocked, rejected and timed-out audio leave valid turns playable", async () => {
  const receipts = [];
  for (const mode of ["absent", "constructor-blocked", "resume-rejected", "resume-timeout"]) {
    const h = await open({ mode });
    try {
      const before = await state(h.page);
      await sound(h.page).click();
      await h.page.waitForFunction(() => /unavailable/.test(document.querySelector("#sound-status").textContent));
      await settledOff(h.page);
      assert.deepEqual(await state(h.page), before);
      assert.equal((await probe(h.page)).starts.length, 0);
      await h.page.getByRole("button", { name: /^Gate/ }).click();
      assert.match((await state(h.page)).summary, /^Day 1 of 14/);
      receipts.push({ mode, before, after: await state(h.page), audio: await probe(h.page) });
    } finally { await h.close(); }
  }
  await artifact("audio-unavailable.json", { faultInjection: "Audio constructor/resume faults are injected only in fresh browser contexts; every successful game turn still uses the unchanged real WASM.", receipts });
});

test("visibility and pagehide handlers discard sound and returning stays silent", async () => {
  const h = await open();
  try {
    await enable(h.page);
    const before = await state(h.page);
    await h.page.evaluate(() => {
      Object.defineProperty(document, "hidden", { value: true, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await settledOff(h.page);
    assert.deepEqual(await state(h.page), before);
    const starts = (await probe(h.page)).starts.length;
    await h.page.evaluate(() => {
      delete document.hidden;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    assert.equal(await sound(h.page).isChecked(), false);
    await h.page.getByRole("button", { name: /^Gate/ }).click();
    assert.equal((await probe(h.page)).starts.length, starts);
    await enable(h.page);
    const prePagehide = await state(h.page);
    await h.page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
    await settledOff(h.page);
    assert.deepEqual(await state(h.page), prePagehide);
    await artifact("lifecycle.json", { method: "Controlled hidden-property and lifecycle-event injection into the actual browser. Native headless Chrome kept document.hidden false when tabs/windows were backgrounded; this receipt does not claim physical tab visibility or speaker-device acceptance.", before, prePagehide, audio: await probe(h.page) });
  } finally { await h.close(); }
});

test("the actual synthesized signals are finite, quiet, distinct and end in silence", async () => {
  const h = await open();
  try {
    const signals = await h.page.evaluate(async () => {
      const { renderCue } = await import("./watch-audio.js");
      const results = [];
      for (const name of ["enabled", "gate", "shade", "seed", "closed", "gate"]) {
        const context = new OfflineAudioContext(1, 72000, 48000);
        const output = context.createGain(); output.gain.value = 0.35; output.connect(context.destination);
        renderCue(context, output, name);
        const samples = (await context.startRendering()).getChannelData(0);
        let peak = 0, energy = 0, nonzero = 0, lastNonzero = 0, finite = true;
        const pcm = new Int16Array(samples.length);
        for (let i = 0; i < samples.length; i++) {
          const sample = samples[i]; finite &&= Number.isFinite(sample);
          peak = Math.max(peak, Math.abs(sample)); energy += sample * sample;
          if (Math.abs(sample) > 1e-7) { nonzero++; lastNonzero = i; }
          pcm[i] = Math.round(Math.max(-1, Math.min(1, sample)) * 32767);
        }
        const bytes = new Uint8Array(pcm.buffer); let encoded = "";
        for (let i = 0; i < bytes.length; i += 32768) encoded += String.fromCharCode(...bytes.subarray(i, i + 32768));
        results.push({ name, sampleRate: 48000, frames: samples.length, peak, rms: Math.sqrt(energy / samples.length), nonzero, lastNonzeroSeconds: lastNonzero / 48000, finite, pcm: btoa(encoded), tailSilent: samples.subarray(57600).every(x => x === 0) });
      }
      return results;
    });
    const receipts = [];
    for (const signal of signals) {
      const pcm = Buffer.from(signal.pcm, "base64");
      assert.equal(signal.finite, true);
      assert.ok(signal.peak > 0.005 && signal.peak < 0.16, signal.name + " has a bounded actual signal");
      assert.ok(signal.rms > 0.001 && signal.rms < 0.05);
      assert.ok(signal.nonzero > 1000);
      assert.ok(signal.lastNonzeroSeconds < 1.1);
      assert.equal(signal.tailSilent, true);
      const header = Buffer.alloc(44);
      header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVEfmt ", 8);
      header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
      header.writeUInt32LE(48000, 24); header.writeUInt32LE(96000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
      header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
      const wav = Buffer.concat([header, pcm]);
      await writeFile(resolve(output, signal.name + ".wav"), wav);
      const { pcm: omitted, ...metrics } = signal;
      receipts.push({ ...metrics, pcmSha256: hash(pcm), wavSha256: hash(wav) });
    }
    assert.equal(receipts[1].pcmSha256, receipts[5].pcmSha256, "same native renderer and cue produce exact repeated PCM");
    assert.equal(new Set(receipts.slice(0, 5).map(r => r.pcmSha256)).size, 5, "all cues have distinct actual signals");
    await artifact("signal-receipt.json", { engine: browser.version(), receipts, limitation: "OfflineAudioContext signal qualification, not physical speaker or subjective listening acceptance." });
  } finally { await h.close(); }
});

test("the real offline copy exposes a usable 320px switch and plays embedded cues", async () => {
  const h = await open({ offline: true, viewport: { width: 320, height: 568 } });
  try {
    assert.equal(await sound(h.page).isChecked(), false);
    const before = await state(h.page);
    await sound(h.page).scrollIntoViewIfNeeded();
    const label = sound(h.page).locator("..");
    const bounds = await label.boundingBox();
    assert.ok(bounds.width >= 44 && bounds.height >= 44);
    assert.equal(await h.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await label.tap();
    await h.page.waitForFunction(() => document.querySelector("#sound-status").textContent === "On");
    assert.deepEqual(await state(h.page), before);
    await h.page.screenshot({ path: resolve(output, "offline-sound-320.png"), fullPage: true });
    await h.page.getByRole("button", { name: /^Seed/ }).click();
    assert.match((await state(h.page)).summary, /^Day 1 of 14/);
    assert.equal((await probe(h.page)).starts.length, 4);
    const bytes = await readFile("downloads/Longwater-Fourteen-Tides.html");
    await artifact("offline-sound.json", { artifactSha256: hash(bytes), bounds, audio: await probe(h.page), external: h.external });
  } finally { await h.close(); }
});

test("a failed native game startup keeps the sound control disabled", async () => {
  const h = await open({ startupFailure: true });
  try {
    assert.match(await h.page.locator("#live").textContent(), /could not start/);
    assert.equal(await sound(h.page).isDisabled(), true);
    assert.deepEqual((await probe(h.page)).contexts, []);
  } finally { await h.close(); }
});
