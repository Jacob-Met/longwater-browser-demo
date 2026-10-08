import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { initSync, BrowserSession } from "../pkg/longwater_web.js";
import { SavedWatch, WATCH_SAVE_KEY } from "../watch-save.js";
import { compareHistoricalTide } from "../watch-choice-model.js";

initSync({ module: await readFile(new URL("../pkg/longwater_web_bg.wasm", import.meta.url)) });
const TURNS = [["shade", "heart"], ["gate", "north"], ["seed", "south"]];

function history(turns = TURNS) {
  const native = new BrowserSession();
  try {
    const snapshots = [native.snapshot_json()];
    for (const [action, cell] of turns) snapshots.push(native.take_turn(action, cell));
    return snapshots;
  } finally { native.free(); }
}

function independent(snapshots, tide, action, cell) {
  const native = new BrowserSession();
  try {
    for (let index = 1; index < tide; index++) {
      const report = JSON.parse(snapshots[index]).report;
      native.take_turn(report.action, report.cell);
    }
    return JSON.parse(native.take_turn(action, cell));
  } finally { native.free(); }
}

function trackedFactory() {
  const counts = { created: 0, freed: 0 };
  const factory = () => {
    const native = new BrowserSession();
    counts.created++;
    let freed = false;
    return {
      snapshot_json: () => native.snapshot_json(),
      take_turn: (action, cell) => native.take_turn(action, cell),
      free: () => {
        assert.equal(freed, false, "an owned native session is freed only once");
        freed = true;
        counts.freed++;
        native.free();
      },
    };
  };
  return { counts, factory };
}

class RecordingStorage {
  raw = null;
  reads = 0;
  writes = 0;
  getItem(key) { assert.equal(key, WATCH_SAVE_KEY); this.reads++; return this.raw; }
  setItem(key, value) { assert.equal(key, WATCH_SAVE_KEY); this.writes++; this.raw = value; }
}

test("each recorded choice reproduces the exact complete native tide and frees both sessions", () => {
  const snapshots = Object.freeze(history());
  for (let tide = 1; tide < snapshots.length; tide++) {
    const report = JSON.parse(snapshots[tide]).report;
    const { factory, counts } = trackedFactory();
    const actual = compareHistoricalTide(snapshots, tide, report.action, report.cell, factory);
    assert.deepEqual(actual.before, JSON.parse(snapshots[tide - 1]));
    assert.deepEqual(actual.played, JSON.parse(snapshots[tide]));
    assert.deepEqual(actual.alternative, actual.played);
    assert.equal(actual.matchesPlayed, true);
    assert.deepEqual(counts, { created: 2, freed: 2 });
    assert.equal(Object.isFrozen(actual), true);
    assert.equal(Object.isFrozen(actual.alternative.cells[0]), true);
    assert.equal(Object.isFrozen(actual.alternative.report.lines), true);
  }
});

test("alternative actions on every cell preserve every native field and the original input history", () => {
  const snapshots = history();
  const retained = snapshots.slice();
  for (const cell of ["north", "heart", "south"]) {
    for (const action of ["gate", "shade", "seed"]) {
      const actual = compareHistoricalTide(snapshots, 2, action, cell, () => new BrowserSession());
      assert.deepEqual(actual.alternative, independent(snapshots, 2, action, cell));
      assert.deepEqual(actual.played, JSON.parse(snapshots[2]));
      assert.equal(actual.alternative.day, 2);
      assert.equal(actual.alternative.report.action, action);
      assert.equal(actual.alternative.report.cell, cell);
    }
  }
  assert.deepEqual(snapshots, retained);
});

test("changed intermediate native readings or field notes are refused even with an exact final snapshot", () => {
  for (const mutate of [
    state => { state.cells[0].depth++; },
    state => { state.report.lines[0] += " altered"; },
    state => { state.freshwater++; },
  ]) {
    const snapshots = history();
    const final = snapshots.at(-1);
    const changed = JSON.parse(snapshots[1]);
    mutate(changed);
    snapshots[1] = JSON.stringify(changed);
    const { factory, counts } = trackedFactory();
    assert.throws(() => compareHistoricalTide(snapshots, 2, "seed", "heart", factory), /Completed tide 1.*native replay/);
    assert.equal(snapshots.at(-1), final, "the mismatched intermediate state is detected independently of final equality");
    assert.deepEqual(counts, { created: 1, freed: 1 });
  }
});

test("a changed native opening and a changed completed action cannot become comparison authority", () => {
  const opening = history();
  const changed = JSON.parse(opening[0]);
  changed.cells[2].biomass++;
  opening[0] = JSON.stringify(changed);
  const first = trackedFactory();
  assert.throws(() => compareHistoricalTide(opening, 1, "gate", "north", first.factory), /opening does not match/);
  assert.deepEqual(first.counts, { created: 1, freed: 1 });

  const action = history();
  const altered = JSON.parse(action[2]);
  altered.report.cell = "south";
  action[2] = JSON.stringify(altered);
  const second = trackedFactory();
  assert.throws(() => compareHistoricalTide(action, 1, "seed", "north", second.factory), /Completed tide 2.*native replay/);
  assert.deepEqual(second.counts, { created: 1, freed: 1 },
    "even a later inconsistent snapshot blocks an earlier-tide comparison");
});

test("empty, malformed, overlong, reordered and incomplete histories refuse before allocating native state", () => {
  const valid = history();
  const invalid = [
    null, {}, [], valid.slice(0, 1), ["not json", valid[1]],
    [" ".repeat(32769), valid[1]], [valid[0], {}],
    [valid[0], valid[2], valid[1], valid[3]],
    [valid[0], valid[1], valid[3]],
    Array.from({ length: 16 }, () => valid[0]),
    ["null", valid[1]],
  ];
  for (const snapshots of invalid) {
    const { factory, counts } = trackedFactory();
    assert.throws(() => compareHistoricalTide(snapshots, 1, "gate", "north", factory));
    assert.deepEqual(counts, { created: 0, freed: 0 });
  }
  for (const tide of [0, -1, 4, 14, 1.5, NaN, Infinity, "1"]) {
    const { factory, counts } = trackedFactory();
    assert.throws(() => compareHistoricalTide(valid, tide, "gate", "north", factory), /already completed tide/);
    assert.deepEqual(counts, { created: 0, freed: 0 });
  }
  for (const [action, cell] of [["unknown", "north"], ["gate", "elsewhere"], [null, "north"]]) {
    const { factory, counts } = trackedFactory();
    assert.throws(() => compareHistoricalTide(valid, 1, action, cell, factory), /Choose Gate/);
    assert.deepEqual(counts, { created: 0, freed: 0 });
  }
});

test("historical canopy admission uses the selected tide and a native refusal frees its isolated session", () => {
  const snapshots = history([["shade", "heart"], ["shade", "heart"], ["shade", "heart"], ["seed", "south"]]);
  assert.equal(JSON.parse(snapshots[3]).cells[1].shade, 3);
  const refused = trackedFactory();
  assert.throws(() => compareHistoricalTide(snapshots, 4, "shade", "heart", refused.factory), /maximum/i);
  assert.deepEqual(refused.counts, { created: 2, freed: 2 });
  const prior = compareHistoricalTide(snapshots, 1, "shade", "heart", () => new BrowserSession());
  assert.equal(prior.matchesPlayed, true);
  assert.equal(prior.before.cells[1].shade, 0);
  assert.equal(prior.alternative.cells[1].shade, 1);
});

test("exhausted current water and seed packs do not prevent an available historical alternative", () => {
  for (const [action, resource, other] of [["gate", "freshwater", "seed"], ["seed", "seedPacks", "gate"]]) {
    const native = new BrowserSession();
    let snapshots;
    try {
      snapshots = [native.snapshot_json()];
      while (JSON.parse(snapshots.at(-1))[resource] > 0 && snapshots.length <= 13) {
        snapshots.push(native.take_turn(action, "heart"));
      }
      const depleted = JSON.parse(snapshots.at(-1));
      assert.equal(depleted[resource], 0, "actual native fixture reaches " + resource + " exhaustion");
      snapshots.push(native.take_turn(other, "south"));
    } finally { native.free(); }
    const beforeRefusal = snapshots.slice();
    const refused = trackedFactory();
    assert.throws(() => compareHistoricalTide(snapshots, snapshots.length - 1, action, "north", refused.factory));
    assert.deepEqual(refused.counts, { created: 2, freed: 2 });
    const actual = compareHistoricalTide(snapshots, 1, action, "north", () => new BrowserSession());
    assert.deepEqual(actual.alternative, independent(snapshots, 1, action, "north"));
    assert.equal(actual.before[resource] > 0, true);
    assert.deepEqual(snapshots, beforeRefusal);
  }
});

test("successful and refused comparisons leave the actual SavedWatch, selection, storage bytes and next tide unchanged", t => {
  const storage = new RecordingStorage();
  const watch = new SavedWatch({ createSession: () => new BrowserSession(), getStorage: () => storage });
  t.after(() => watch.free());
  for (const [action, cell] of TURNS) {
    watch.select(["north", "heart", "south"].indexOf(cell));
    watch.takeTurn(action);
  }
  const snapshots = watch.replayHistory();
  const before = {
    snapshot: watch.snapshot, selected: watch.selected, status: watch.status,
    raw: storage.raw, reads: storage.reads, writes: storage.writes,
  };
  compareHistoricalTide(snapshots, 2, "seed", "heart", () => new BrowserSession());
  assert.throws(() => compareHistoricalTide(snapshots, 4, "gate", "north", () => new BrowserSession()));
  assert.deepEqual({
    snapshot: watch.snapshot, selected: watch.selected, status: watch.status,
    raw: storage.raw, reads: storage.reads, writes: storage.writes,
  }, before);
  assert.equal(watch.takeTurn("gate"), history([...TURNS, ["gate", "south"]]).at(-1));
});

test("read-only comparison remains available while the real watch cannot access storage", t => {
  let storageAttempts = 0;
  const watch = new SavedWatch({
    createSession: () => new BrowserSession(),
    getStorage: () => { storageAttempts++; throw new Error("Authored storage refusal"); },
  });
  t.after(() => watch.free());
  watch.takeTurn("shade");
  const before = { snapshot: watch.snapshot, selected: watch.selected, status: watch.status, storageAttempts };
  const snapshots = watch.replayHistory();
  const actual = compareHistoricalTide(snapshots, 1, "seed", "north", () => new BrowserSession());
  assert.deepEqual(actual.alternative, independent(snapshots, 1, "seed", "north"));
  assert.deepEqual({ snapshot: watch.snapshot, selected: watch.selected, status: watch.status, storageAttempts }, before);
});

test("all fourteen admitted snapshots and the final native outcome remain reproducible", () => {
  const native = new BrowserSession();
  let snapshots;
  try {
    snapshots = [native.snapshot_json()];
    while (!JSON.parse(snapshots.at(-1)).finished) {
      const state = JSON.parse(snapshots.at(-1));
      const cell = state.cells.find(value => value.shade < 3) ?? state.cells[0];
      const action = cell.shade < 3 ? "shade" : state.freshwater > 0 ? "gate" : "seed";
      snapshots.push(native.take_turn(action, cell.id));
    }
  } finally { native.free(); }
  assert.equal(snapshots.length, 15);
  const retained = snapshots.slice();
  for (let tide = 1; tide <= 14; tide++) {
    const report = JSON.parse(snapshots[tide]).report;
    const actual = compareHistoricalTide(snapshots, tide, report.action, report.cell, () => new BrowserSession());
    assert.deepEqual(actual.alternative, JSON.parse(snapshots[tide]));
  }
  const final = JSON.parse(snapshots[14]);
  const result = compareHistoricalTide(snapshots, 14, final.report.action, final.report.cell, () => new BrowserSession());
  assert.equal(result.alternative.finished, true);
  assert.equal(result.alternative.outcome, final.outcome);
  assert.deepEqual(snapshots, retained);
});
