import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const native = '/dev/longwater-root';
const root = native + '/composed';
const out = native + '/composition-out';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { serve } = await import(pathToFileURL(root + '/tests/server.mjs'));
const inputsBytes = await readFile(native + '/pre-candidate-inputs.json');
assert.equal(createHash('sha256').update(inputsBytes).digest('hex'), '9d8378d140ed306354263850567cea0ff2e942e030f46148d8a6f6ef24430315');
const inputs = JSON.parse(inputsBytes);
const states = inputs.snapshots.map(JSON.parse);
const results = [];
const requests = [];
let browser, server;
const startedAt = new Date().toISOString();
let comparisons = 0;

async function group(name, fn) {
  const start = Date.now();
  try {
    const detail = await fn();
    results.push({ name, passed: true, ms: Date.now() - start, detail });
    console.log(JSON.stringify(results.at(-1)));
  } catch (error) {
    results.push({ name, passed: false, ms: Date.now() - start, error: String(error), stack: error.stack });
    console.log(JSON.stringify(results.at(-1)));
    throw error;
  }
}

async function pageFor(url, saved = null, viewport = { width: 1280, height: 920 }) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
  await context.addInitScript(({ key, raw }) => {
    if (raw !== null && localStorage.getItem(key) === null) localStorage.setItem(key, raw);
    window.__receivingWrites = 0;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(keyWritten, value) {
      if (this === localStorage && keyWritten === key) window.__receivingWrites++;
      return original.call(this, keyWritten, value);
    };
  }, { key: inputs.validSaveKey, raw: saved });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (['file:', 'data:', 'blob:'].includes(url.protocol)) return route.continue();
    const allowed = url.origin === server.url;
    requests.push({ url: url.href, allowed });
    return allowed ? route.continue() : route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.errors = [];
  page.on('pageerror', error => page.errors.push(String(error)));
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('#state-summary').textContent.startsWith('Day '));
  await openJournal(page);
  return { page, context };
}

async function openJournal(page) {
  if (!await page.locator('#journal-details').evaluate(el => el.open)) await page.locator('#journal-details > summary').click();
  await page.waitForFunction(() => document.querySelector('#trend-chart').clientWidth > 0 && document.querySelector('#trend-chart').hasAttribute('viewBox'));
}

async function savedWitness(page) {
  return page.evaluate(key => ({ raw: localStorage.getItem(key), writes: window.__receivingWrites }), inputs.validSaveKey);
}

async function tide(page, day) {
  await page.locator('#trend-tide').focus();
  await page.keyboard.press('Home');
  for (let n = 0; n < day; n++) await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#trend-tide').inputValue(), String(day));
  assert.equal(await page.evaluate(() => document.activeElement.id), 'trend-tide');
}

async function compareMetric(page, metric, expectedStates, selectedDay) {
  await page.selectOption('#trend-metric', metric.field);
  const observed = await page.locator('#watch-trends').evaluate(root => {
    const chart = root.querySelector('#trend-chart');
    return {
      header: [...root.querySelectorAll('#trend-table thead th')].map(el => ({ value: el.textContent, scope: el.scope })),
      rows: [...root.querySelectorAll('#trend-table tbody tr')].map(row => ({ title: row.querySelector('th').textContent, scope: row.querySelector('th').scope, values: [...row.querySelectorAll('td')].map(el => Number(el.textContent)) })),
      caption: root.querySelector('caption').textContent,
      selected: root.querySelector('#trend-selected').textContent,
      context: root.querySelector('#trend-context').textContent,
      readout: [...root.querySelectorAll('#trend-values div')].map(row => [row.querySelector('dt').textContent, row.querySelector('dd').textContent]),
      legend: [...root.querySelectorAll('.trend-legend li')].map(el => el.textContent),
      axis: [...chart.querySelectorAll('text[text-anchor="end"]')].map(el => Number(el.textContent)),
      gridY: [...chart.querySelectorAll('.trend-grid')].map(el => Number(el.getAttribute('y1'))),
      lines: [...chart.querySelectorAll('polyline')].map(el => ({ id: el.dataset.trendCell, dash: el.getAttribute('stroke-dasharray'), points: el.getAttribute('points').split(' ').map(point => point.split(',').map(Number)) })),
      ariaValue: root.querySelector('#trend-tide').getAttribute('aria-valuetext'),
      scope: root.querySelector('#trend-scope').textContent,
    };
  });
  assert.deepEqual(observed.header, ['Tide', ...inputs.identities.map(x => x.name)].map(value => ({ value, scope: 'col' })));
  assert.deepEqual(observed.rows, expectedStates.map(state => ({ title: state.day === 0 ? 'Opening' : 'Tide ' + state.day, scope: 'row', values: inputs.identities.map(cell => state.cells.find(x => x.id === cell.id)[metric.field]) })));
  comparisons += expectedStates.length * 3;
  assert.equal(observed.caption, metric.name + ' (' + metric.unit + ') · Opening and every completed tide');
  assert.deepEqual(observed.legend, inputs.identities.map(x => x.name));
  assert.deepEqual(observed.lines.map(x => x.id), inputs.identities.map(x => x.id));
  assert.equal(new Set(observed.lines.map(x => x.dash)).size, 3);
  const bottom = Math.max(...observed.gridY), top = Math.min(...observed.gridY), maximum = Math.max(...observed.axis);
  for (const line of observed.lines) {
    assert.equal(line.points.length, expectedStates.length);
    for (let index = 0; index < line.points.length; index++) {
      const [x, y] = line.points[index];
      assert(Number.isFinite(x) && Number.isFinite(y));
      if (index) assert(x > line.points[index - 1][0]);
      const decoded = (bottom - y) / (bottom - top) * maximum;
      assert(Math.abs(decoded - expectedStates[index].cells.find(c => c.id === line.id)[metric.field]) < 1e-8);
    }
  }
  const selected = expectedStates[selectedDay];
  const label = selected.day === 0 ? 'Opening' : 'Tide ' + selected.day;
  assert.equal(observed.selected, label + ' · ' + metric.name + ' (' + metric.unit + ')');
  assert.equal(observed.ariaValue, label + ' of ' + (expectedStates.length - 1) + ' completed tides');
  assert.deepEqual(observed.readout, inputs.identities.map(cell => [cell.name, String(selected.cells.find(c => c.id === cell.id)[metric.field]) + ' ' + metric.unit]));
  assert.equal(observed.context, selected.report
    ? selected.report.action[0].toUpperCase() + selected.report.action.slice(1) + ' · ' + selected.cells.find(c => c.id === selected.report.cell).name + ' · ' + selected.report.event.name
    : 'Before the first action and tide.');
  if (expectedStates.length > 1) assert(observed.scope.includes('Changes include the action, tide and dawn drift.'));
}

async function doTurn(page, action, cell, preserveFocus = false) {
  const index = inputs.identities.findIndex(item => item.id === cell);
  if (preserveFocus) {
    await page.evaluate(({ index, action }) => {
      document.querySelector('[data-cell="' + index + '"]').click();
      document.querySelector('[data-action="' + action + '"]').click();
    }, { index, action });
  } else {
    await page.locator('[data-cell="' + index + '"]').click();
    await page.locator('[data-action="' + action + '"]').click();
  }
}

async function checkLayout(page, width, capture) {
  await page.setViewportSize({ width, height: width < 500 ? 844 : 920 });
  await page.locator('#watch-trends').scrollIntoViewIfNeeded();
  const geometry = await page.evaluate(() => ({
    viewport: innerWidth, page: document.documentElement.scrollWidth,
    root: document.querySelector('#watch-trends').getBoundingClientRect().toJSON(),
    select: document.querySelector('#trend-metric').getBoundingClientRect().toJSON(),
    slider: document.querySelector('#trend-tide').getBoundingClientRect().toJSON(),
    chart: document.querySelector('#trend-chart').getBoundingClientRect().toJSON(),
  }));
  assert(geometry.page <= geometry.viewport, JSON.stringify(geometry));
  for (const name of ['root', 'select', 'slider', 'chart']) {
    assert(geometry[name].left >= 0 && geometry[name].right <= geometry.viewport);
    assert(geometry[name].width > 200);
  }
  await page.locator('#watch-trends').screenshot({ path: out + '/' + capture });
  return geometry;
}

try {
  assert.equal(createHash('sha256').update(await readFile(root + '/pkg/longwater_web_bg.wasm')).digest('hex'), inputs.nativeWasmSha256);
  server = await serve();
  browser = await chromium.launch({ executablePath: '/tmp/hamon-project-browser-ce7eb129730f/portable-153/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const live = await pageFor(server.url);
  const page = live.page;
  await group('opening-five-metrics-and-no-tide-on-cell-selection', async () => {
    for (const metric of inputs.metrics) await compareMetric(page, metric, states.slice(0, 1), 0);
    await page.locator('[data-cell="0"]').click();
    assert.equal(await page.locator('#trend-tide').getAttribute('max'), '0');
    assert.equal(await page.locator('#trend-table tbody tr').count(), 1);
    return { exactOpeningValues: 15, completedTides: 0 };
  });
  await group('fourteen-native-turns-earlier-selection-latest-follow-and-focus', async () => {
    for (const [index, [action, cell]] of inputs.steps.entries()) {
      const day = index + 1;
      if (day === 6) await tide(page, 4);
      if (day === 7) { await page.locator('#trend-tide').focus(); await page.keyboard.press('End'); }
      if (day === 8) await page.locator('#trend-metric').focus();
      await doTurn(page, action, cell, day === 6 || day === 8);
      const actual = await savedWitness(page);
      assert.equal(JSON.parse(actual.raw).snapshot, inputs.snapshots[day]);
      assert.equal(await page.locator('#trend-tide').getAttribute('max'), String(day));
      assert.equal(await page.locator('#trend-tide').inputValue(), String(day === 6 ? 4 : day));
      if (day === 6) assert.equal(await page.evaluate(() => document.activeElement.id), 'trend-tide');
      if (day === 8) assert.equal(await page.evaluate(() => document.activeElement.id), 'trend-metric');
    }
    for (const metric of inputs.metrics) await compareMetric(page, metric, states, 14);
    return { nativeSnapshotsExact: 14, distinctHistoryValues: 225, stateFinished: JSON.parse(inputs.snapshots.at(-1)).finished };
  });
  await group('keyboard-pointer-readouts-and-read-only-storage', async () => {
    const before = await savedWitness(page);
    for (const day of [0, 4, 7, 14]) {
      await tide(page, day);
      for (const metric of inputs.metrics) await compareMetric(page, metric, states, day);
    }
    await page.locator('#trend-metric').focus();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'trend-tide');
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#trend-tide').inputValue(), '1');
    await page.keyboard.press('End');
    assert.equal(await page.locator('#trend-tide').inputValue(), '14');
    await page.keyboard.press('g');
    await page.keyboard.press('r');
    await page.locator('#trend-chart').scrollIntoViewIfNeeded();
    const point = await page.locator('#trend-chart').evaluate(el => {
      const [x, y] = el.querySelector('polyline').getAttribute('points').split(' ')[4].split(',').map(Number);
      const box = el.getBoundingClientRect(), view = el.viewBox.baseVal;
      return { x: box.left + x / view.width * box.width, y: box.top + y / view.height * box.height };
    });
    await page.mouse.click(point.x, point.y);
    assert.equal(await page.locator('#trend-tide').inputValue(), '4');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'trend-tide');
    assert.deepEqual(await savedWitness(page), before);
    assert.deepEqual(page.errors, []);
    return { selectedReadoutDays: [0, 4, 7, 14], tableAndPlotValuesAgree: true, writesAdded: 0, pointerFocus: 'trend-tide' };
  });
  await group('desktop-and-phone-layout', async () => {
    const desktop = await checkLayout(page, 1280, 'independent-desktop.png');
    const phone = await checkLayout(page, 390, 'independent-phone.png');
    return { desktop, phone };
  });
  await group('complete-reset-and-changed-first-turn', async () => {
    await page.locator('#reset-control').click();
    assert.equal(await page.locator('#trend-tide').getAttribute('max'), '0');
    for (const metric of inputs.metrics) await compareMetric(page, metric, states.slice(0, 1), 0);
    await doTurn(page, 'shade', 'heart');
    assert.equal(JSON.parse((await savedWitness(page)).raw).snapshot, inputs.rejected.snapshots[1]);
    assert.equal(await page.locator('#trend-table tbody tr').count(), 2);
    return { openingOnlyAfterReset: true, changedFirstTurn: 'shade heart' };
  });
  await live.context.close();

  await group('rejected-fourth-shade-adds-no-history', async () => {
    const current = await pageFor(server.url);
    for (let day = 1; day <= 3; day++) {
      await doTurn(current.page, 'shade', 'heart');
      assert.equal(JSON.parse((await savedWitness(current.page)).raw).snapshot, inputs.rejected.snapshots[day]);
    }
    const before = await savedWitness(current.page);
    const html = await current.page.locator('#watch-trends').innerHTML();
    await current.page.locator('[data-action="shade"]').focus();
    await current.page.keyboard.press('Enter');
    assert.deepEqual(await savedWitness(current.page), before);
    assert.equal(await current.page.locator('#watch-trends').innerHTML(), html);
    assert.equal(await current.page.locator('#trend-table tbody tr').count(), 4);
    await current.context.close();
    return { accepted: 3, rejected: 1, appendedAfterRejection: 0 };
  });
  await group('independent-seven-and-fourteen-tide-saves-survive-reload', async () => {
    const observations = [];
    for (const [day, saved] of [[7, inputs.partialSave], [14, inputs.completedSave]]) {
      const current = await pageFor(server.url, saved);
      assert.equal((await savedWitness(current.page)).raw, saved);
      for (const metric of inputs.metrics) await compareMetric(current.page, metric, states.slice(0, day + 1), day);
      await tide(current.page, 4);
      await current.page.reload();
      await current.page.waitForFunction(() => document.querySelector('#state-summary').textContent.startsWith('Day '));
      await openJournal(current.page);
      assert.equal((await savedWitness(current.page)).raw, saved);
      assert.equal(await current.page.locator('#trend-tide').getAttribute('max'), String(day));
      assert.equal(await current.page.locator('#trend-tide').inputValue(), String(day));
      assert.deepEqual(current.page.errors, []);
      observations.push({ day, storedBytesPreserved: true, restoredRows: await current.page.locator('#trend-table tbody tr').count() });
      await current.context.close();
    }
    return observations;
  });
  await group('journal-invalid-order-rejected-before-view-replacement', async () => {
    const current = await pageFor(server.url, inputs.partialSave);
    const outcome = await current.page.evaluate(async snapshots => {
      const { WatchJournal } = await import('/journal.js');
      const root = document.createElement('section');
      document.body.append(root);
      const journal = new WatchJournal(root);
      journal.restore(snapshots.slice(0, 8));
      const before = root.innerHTML;
      const bad = snapshots.slice(0, 8);
      bad.splice(3, 1);
      let rejected = false;
      try { journal.restore(bad); } catch { rejected = true; }
      const unchanged = root.innerHTML === before;
      journal.trends.resize.disconnect();
      root.remove();
      return { rejected, unchanged };
    }, inputs.snapshots);
    assert.deepEqual(outcome, { rejected: true, unchanged: true });
    await current.context.close();
    return outcome;
  });
  await group('deterministic-package-and-direct-file-native-parity', async () => {
    const packages = [];
    for (const name of ['first.html', 'second.html']) {
      packages.push(JSON.parse(execFileSync(process.execPath, [root + '/scripts/package.mjs', out + '/' + name], { encoding: 'utf8' })));
    }
    const first = await readFile(out + '/first.html'), second = await readFile(out + '/second.html');
    assert.deepEqual(first, second);
    const requestStart = requests.length;
    const current = await pageFor(pathToFileURL(out + '/first.html').href);
    for (const [action, cell] of inputs.steps) await doTurn(current.page, action, cell);
    for (const metric of inputs.metrics) await compareMetric(current.page, metric, states, 14);
    const snapshot = JSON.parse((await savedWitness(current.page)).raw).snapshot;
    assert.equal(snapshot, inputs.snapshots[14]);
    assert.deepEqual(current.page.errors, []);
    assert.equal(requests.length - requestStart, 0);
    await current.context.close();
    return { bytes: first.length, sha256: createHash('sha256').update(first).digest('hex'), sourceSha256: packages[0].sourceSha256, networkRequests: 0, exactFinalState: true, exactHistoryValues: 225 };
  });
} catch (error) {
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
  const tree = execFileSync('git', ['-C', root, 'write-tree'], { encoding: 'utf8' }).trim();
  assert.equal(tree, '21a66561fa9300053ee0b35d2e2c1049ad29fd0d');
  const changed = execFileSync('git', ['-C', root, 'diff', '--name-only'], { encoding: 'utf8' });
  assert.equal(changed, '');
  const report = {
    startedAt, finishedAt: new Date().toISOString(),
    repository: 'Jacob-Met/longwater-browser-demo',
    base: '40b689bdd266d7b53690ca5d667d8916b6815eaf', nativeInputBase: inputs.commit, tree, sourcePaths: 65,
    frozenInputSha256: createHash('sha256').update(inputsBytes).digest('hex'),
    driverSha256: createHash('sha256').update(await readFile(import.meta.filename)).digest('hex'),
    sourceUnchanged: true, passed: results.length === 9 && results.every(x => x.passed),
    groups: results, numericTableComparisons: comparisons,
    requests: { totalLocal: requests.filter(x => x.allowed).length, unexpected: requests.filter(x => !x.allowed) },
    limitation: inputs.limits,
    selectionClarification: JSON.parse(await readFile(native + '/receiving-clarification.json', 'utf8')),
  };
  await writeFile(out + '/independent-receiving.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ report: out + '/independent-receiving.json', passed: report.passed, groups: results.length, numericTableComparisons: comparisons, tree }));
  if (!report.passed) process.exitCode = 1;
}

