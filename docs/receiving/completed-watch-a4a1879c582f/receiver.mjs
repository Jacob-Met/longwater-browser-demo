import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), 'source'));
const output = resolve(process.argv[3] || join(dirname(fileURLToPath(import.meta.url)), 'results'));
const chromiumPath = process.env.LONGWATER_CHROME_PATH;
assert.ok(chromiumPath, 'Set LONGWATER_CHROME_PATH to the actual receiving Chromium executable.');
const { chromium } = await import(process.env.LONGWATER_PLAYWRIGHT_MODULE || 'playwright');
const { initSync, BrowserSession } = await import(pathToFileURL(join(root, 'pkg/longwater_web.js')));
const wasm = await readFile(join(root, 'pkg/longwater_web_bg.wasm'));
initSync({ module: wasm });
const sha256 = value => createHash('sha256').update(value).digest('hex');
const key = 'longwater.watch.v1';
const turns = [[2, 'gate'], [0, 'seed'], [1, 'shade'], [2, 'seed'], [0, 'gate'], [1, 'seed'], [2, 'shade'], [0, 'shade'], [1, 'gate'], [2, 'gate'], [0, 'seed'], [1, 'shade'], [2, 'seed'], [0, 'gate']];
const sourceNames = ["index.html", "style.css", "journal.css", "watch-trends.css", "watch-save.css", "watch-report.css", "watch-file.css", "watch-choice.css", "practice-watch.css", "game.js", "pkg/longwater_web.js", "journal.js", "watch-save.js", "watch-file.js", "watch-choice.js", "practice-watch.js", "watch-trends.js", "watch-report.js", "watch-choice-model.js", "pkg/longwater_web_bg.wasm", "scripts/package.mjs", "package.json"];
const sourceBefore = {};
for (const name of sourceNames) sourceBefore[name] = sha256(await readFile(join(root, name)));
await mkdir(output, { recursive: true });
const receipt = {
  started_at: new Date().toISOString(),
  node: process.version,
  source_root: root,
  chromium_path: chromiumPath,
  wasm_sha256: sha256(wasm),
  source_before: sourceBefore,
  source_commit: '9407f172518d0d6b19146e2431bcabbb2c307241',
  source_tree: '213c1143ca58a170dc4d22525e5e8a6f0c62061b',
  scope: 'Current-source three-process offline completed-watch persistence only; BFCache is not executed.',
  historical_receipt_sha256: '43982f39dbc77565455e0f1d303a4495cd51032f97654d0466ebfbc764d17cb1',
  cases: [],
};

async function ownBrowserPids(profile) {
  const pids = [];
  for (const entry of await readdir('/proc')) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const args = (await readFile(`/proc/${entry}/cmdline`, 'utf8')).split('\0');
      if (args.includes(`--user-data-dir=${profile}`) && !args.some(arg => arg.startsWith('--type='))) pids.push(Number(entry));
    } catch { /* A process can exit while /proc is read. */ }
  }
  return pids;
}

async function ready(page, url) {
  await page.goto(url);
  await page.waitForFunction(() => /Day \d+ of 14/.test(document.querySelector('#state-summary')?.textContent));
}
async function act(page, session, states, [cell, action]) {
  await page.locator(`[data-cell="${cell}"]`).click();
  await page.locator(`[data-action="${action}"]`).click();
  const next = JSON.parse(session.take_turn(action, states.at(-1).cells[cell].id));
  states.push(next);
  assert.match(await page.locator('#state-summary').textContent(), new RegExp(`Day ${next.day} of 14`));
}
async function rawSave(page) { return page.evaluate(key => localStorage.getItem(key), key); }
async function assertNativeJournal(page, states) {
  const last = states.at(-1);
  assert.equal(await page.locator('#journal-entries > li').count(), last.day);
  for (let day = 1; day < states.length; day++) {
    const before = states[day - 1], after = states[day];
    const entry = page.locator(`[data-tide="${day}"]`);
    assert.deepEqual(await entry.locator('.journal-notes > li').allTextContents(), after.report.lines);
    assert.equal(await entry.locator('.journal-event-note').textContent(), after.report.event.note);
    assert.equal(await entry.locator('.journal-resources').textContent(), `Freshwater: ${before.freshwater} → ${after.freshwater}. Seed packs: ${before.seedPacks} → ${after.seedPacks}.`);
    for (const cell of after.cells) {
      const prior = before.cells.find(item => item.id === cell.id);
      assert.deepEqual(await entry.locator(`[data-cell-id="${cell.id}"] dd`).allTextContents(), [
        `${prior.depth} → ${cell.depth} cm`, `${prior.salinity} → ${cell.salinity} ppt`,
        `${prior.oxygen} → ${cell.oxygen} %`, `${prior.biomass} → ${cell.biomass} %`, `${prior.shade} → ${cell.shade} / 3`,
      ]);
    }
  }
  assert.match(await page.locator('#state-summary').textContent(), new RegExp(`Day ${last.day} of 14`));
}

async function offlineProcessRestart() {
  const result = { name: 'completed offline watch survives full browser-process restart', status: 'running', launches: [], errors: [], unexpected_requests: [] };
  receipt.cases.push(result);
  const packaged = JSON.parse(execFileSync(process.execPath, [join(root, 'scripts/package.mjs'), join(output, 'Longwater-Fourteen-Tides.html')], { encoding: 'utf8' }));
  result.package = packaged;
  const packagedBytes = await readFile(packaged.file);
  const packageBlob = createHash('sha1').update(Buffer.from('blob ' + packagedBytes.length + '\0')).update(packagedBytes).digest('hex');
  result.published_artifact_git_blob = packageBlob;
  assert.equal(packageBlob, '4c9b109de95b7e7bd62a9919bc2862040fc1dc6f', 'current native packager reproduces exact immutable published download');
  assert.equal(packagedBytes.length, 339166);
  assert.equal(sha256(packagedBytes), '1d8fd1112ccda3a9cfc06077915d2b13a303dcc128682afa1f85b0436f947c33');
  const url = pathToFileURL(packaged.file).href;
  const profile = await mkdtemp(join(output, 'owned-offline-profile-'));
  const native = new BrowserSession();
  const states = [JSON.parse(native.snapshot_json())];
  let context;
  let previousRaw;
  try {
    for (const [phase, start, end] of [['partial', 0, 5], ['complete', 5, 14], ['reopen-completed', 14, 14]]) {
      context = await chromium.launchPersistentContext(profile, {
        headless: true, executablePath: chromiumPath, offline: true,
        viewport: { width: 390, height: 844 }, deviceScaleFactor: 1,
      });
      receipt.chromium = context.browser()?.version() || receipt.chromium;
      context.on('request', request => {
        if (request.url() !== url && !request.url().startsWith('data:')) result.unexpected_requests.push(request.url());
      });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      page.on('pageerror', error => result.errors.push(error.message));
      const pids = await ownBrowserPids(profile);
      assert.equal(pids.length, 1, 'one actual browser process owns this isolated persistent profile');
      assert.ok(!result.launches.some(launch => launch.browser_pid === pids[0]), 'a fresh OS browser process is used after each shutdown');
      const launch = { phase, browser_pid: pids[0], starting_day: start };
      result.launches.push(launch);
      await ready(page, url);
      if (start) {
        assert.equal(await rawSave(page), previousRaw, 'startup replay does not rewrite the saved bytes');
        assert.match(await page.locator('#watch-save-status').textContent(), new RegExp(`Resumed your saved watch at day ${start}`));
        await assertNativeJournal(page, states);
      }
      for (const turn of turns.slice(start, end)) await act(page, native, states, turn);
      await assertNativeJournal(page, states);
      const saved = await rawSave(page);
      assert.equal(JSON.parse(saved).snapshot, native.snapshot_json(), 'persistent file save retains the exact native simulation state');
      assert.equal(JSON.parse(saved).turns.length, end);
      if (end === 14) {
        assert.equal(await page.locator('#watch-recap').isVisible(), true);
        assert.match(await page.locator('#watch-recap h3').textContent(), new RegExp(states.at(-1).outcome));
        assert.equal(await page.locator('#journal-count').textContent(), '14 of 14 tides · Watch closed');
      }
      if (phase === 'reopen-completed') {
        await page.locator('[data-action="gate"]').click({ force: true });
        assert.equal(await rawSave(page), saved, 'a completed offline watch remains closed after another process restart');
        assert.equal(await page.locator('#journal-entries > li').count(), 14);
        await page.screenshot({ path: join(output, 'completed-offline-reopened.png'), fullPage: false });
      }
      previousRaw = saved;
      launch.saved_sha256 = sha256(saved);
      launch.ending_day = end;
      await context.close();
      context = null;
      assert.deepEqual(await ownBrowserPids(profile), [], 'the old OS browser process has exited before the next launch');
      launch.exited_before_next_launch = true;
    }
    await writeFile(join(output, 'completed-offline-save.json'), previousRaw + '\n');
    result.native_states = states;
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.unexpected_requests, []);
    result.status = 'passed';
  } catch (error) {
    result.status = 'failed'; result.failure = String(error.stack || error); throw error;
  } finally {
    await context?.close();
    native.free();
    await rm(profile, { recursive: true, force: true });
  }
}


try {
  await offlineProcessRestart();
  await writeFile(join(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
} catch (error) {
  receipt.failure = String(error.stack || error);
  process.exitCode = 1;
} finally {
  receipt.source_after = {};
  for (const name of sourceNames) receipt.source_after[name] = sha256(await readFile(join(root, name)));
  receipt.source_unchanged = JSON.stringify(receipt.source_after) === JSON.stringify(sourceBefore);
  if (!receipt.source_unchanged) process.exitCode = 1;
  receipt.finished_at = new Date().toISOString();
  await writeFile(join(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ status: process.exitCode ? 'failed' : 'passed', cases: receipt.cases.map(({ name, status, failure }) => ({ name, status, failure })), source_unchanged: receipt.source_unchanged, receipt: join(output, 'receipt.json') }));
}
