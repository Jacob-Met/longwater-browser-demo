import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { initSync, BrowserSession } from "../pkg/longwater_web.js";
import { SavedWatch, WATCH_SAVE_KEY, MAX_SAVE_LENGTH, SIMULATION_REVISION } from "../watch-save.js";

initSync({ module: await readFile(new URL("../pkg/longwater_web_bg.wasm", import.meta.url)) });

class Storage {
  raw = null;
  writes = 0;
  readsFail = false;
  writesFail = false;
  getItem(key) {
    assert.equal(key, WATCH_SAVE_KEY);
    if (this.readsFail) throw new Error("SecurityError");
    return this.raw;
  }
  setItem(key, raw) {
    assert.equal(key, WATCH_SAVE_KEY);
    if (this.writesFail) throw new Error("QuotaExceededError");
    this.raw = raw;
    this.writes++;
  }
}
function open(t, storage = new Storage(), createSession = () => new BrowserSession()) {
  const watch = new SavedWatch({ createSession, getStorage: () => storage });
  t.after(() => watch.free());
  return { watch, storage };
}
function sample(t) {
  const pair = open(t);
  pair.watch.takeTurn("shade");
  pair.watch.select(0);
  pair.watch.takeTurn("gate");
  pair.watch.select(2);
  pair.watch.takeTurn("seed");
  return pair;
}
function finish(watch) {
  while (!JSON.parse(watch.snapshot).finished) {
    const state = JSON.parse(watch.snapshot);
    const cell = state.cells.findIndex(item => item.shade < 3);
    watch.select(cell < 0 ? 0 : cell);
    watch.takeTurn(cell >= 0 ? "shade" : state.freshwater > 0 ? "gate" : "seed");
  }
}

test("export captures the active unsaved watch without touching storage or replaying a tide", t => {
  const { watch, storage } = sample(t);
  const earlier = storage.raw;
  storage.writesFail = true;
  watch.takeTurn("shade");
  storage.readsFail = true;
  const snapshot = watch.snapshot;
  const writes = storage.writes;
  const exported = watch.exportFile();
  const value = JSON.parse(exported);
  assert.equal(value.simulation, SIMULATION_REVISION);
  assert.equal(value.version, 1);
  assert.equal(value.snapshot, snapshot);
  assert.equal(value.selected, "south");
  assert.equal(value.turns.length, 4);
  assert.equal(storage.raw, earlier);
  assert.equal(storage.writes, writes);
  assert.equal(watch.snapshot, snapshot);
  assert.equal(watch.status.kind, "unavailable");
});

test("preview is read-only and deliberate replacement restores exact state, selection and full journal history", t => {
  const source = sample(t).watch;
  const { watch, storage } = open(t);
  watch.takeTurn("gate");
  const before = { snapshot: watch.snapshot, raw: storage.raw, writes: storage.writes };
  const raw = source.exportFile();
  const preview = watch.previewFile(raw);
  assert.equal(preview.day, 3);
  assert.equal(preview.selected, 2);
  assert.equal(preview.cell, "South Reach");
  assert.equal(preview.finished, false);
  assert.equal(Object.isFrozen(preview), true);
  assert.equal(watch.snapshot, before.snapshot);
  assert.equal(storage.raw, before.raw);
  assert.equal(storage.writes, before.writes);
  assert.equal(watch.restoreFile(preview), source.snapshot);
  assert.equal(watch.selected, 2);
  assert.deepEqual(watch.replayHistory(), source.replayHistory());
  assert.equal(storage.raw, raw);
  assert.equal(open(t, storage).watch.snapshot, source.snapshot);
});

test("a completed watch carries all fourteen native tides and its outcome", t => {
  const source = open(t).watch;
  finish(source);
  const raw = source.exportFile();
  const target = open(t).watch;
  const preview = target.previewFile(raw);
  assert.equal(preview.day, 14);
  assert.equal(preview.finished, true);
  assert.equal(preview.outcome, JSON.parse(source.snapshot).outcome);
  target.restoreFile(preview);
  assert.equal(target.snapshot, source.snapshot);
  assert.equal(target.replayHistory().length, 15);
  assert.deepEqual(target.replayHistory(), source.replayHistory());
  assert.throws(() => target.takeTurn("gate"), /complete/i);
  assert.equal(target.exportFile(), raw);
});

test("invalid, incompatible and tampered files cannot change the active watch or stored bytes", t => {
  const source = sample(t).watch.exportFile();
  const { watch, storage } = sample(t);
  const before = { snapshot: watch.snapshot, raw: storage.raw, writes: storage.writes };
  const edit = change => { const value = JSON.parse(source); change(value); return JSON.stringify(value); };
  const invalid = [
    "not json", "null", "[]", " ".repeat(MAX_SAVE_LENGTH + 1),
    edit(value => { value.version = 2; }),
    edit(value => { value.simulation = "other game"; }),
    edit(value => { value.extra = true; }),
    edit(value => { value.selected = "unknown"; }),
    edit(value => { value.turns[0].cell = "north"; }),
    edit(value => { value.turns[0].action = "invented"; }),
    edit(value => { value.snapshot = value.snapshot.replace('"day":3', '"day":9'); }),
    edit(value => { value.turns = Array.from({ length: 4 }, () => ({ action: "shade", cell: "heart" })); }),
    edit(value => { value.turns = Array.from({ length: 15 }, () => ({ action: "gate", cell: "heart" })); }),
  ];
  for (const raw of invalid) {
    const priorPreview = watch.previewFile(source);
    assert.throws(() => watch.previewFile(raw));
    assert.throws(() => watch.restoreFile(priorPreview), /changed|review/i);
    assert.equal(watch.snapshot, before.snapshot);
    assert.equal(storage.raw, before.raw);
    assert.equal(storage.writes, before.writes);
  }
});

test("preview and rejected native replay free temporary WASM sessions", t => {
  let created = 0, freed = 0;
  const createSession = () => {
    created++;
    const native = new BrowserSession();
    return {
      snapshot_json: () => native.snapshot_json(),
      take_turn: (action, cell) => native.take_turn(action, cell),
      restart: () => native.restart(),
      free: () => { freed++; native.free(); },
    };
  };
  const { watch } = open(t, new Storage(), createSession);
  const valid = sample(t).watch.exportFile();
  watch.previewFile(valid);
  assert.equal(created - freed, 1);
  const invalid = JSON.parse(valid);
  invalid.turns = Array.from({ length: 4 }, () => ({ action: "shade", cell: "heart" }));
  assert.throws(() => watch.previewFile(JSON.stringify(invalid)));
  assert.equal(created - freed, 1, "only the active session remains");
});

test("selection, accepted play and reset invalidate confirmation, including reset back to the same opening state", t => {
  const raw = sample(t).watch.exportFile();
  for (const mutate of [watch => watch.select(0), watch => watch.takeTurn("gate"), watch => watch.reset()]) {
    const { watch, storage } = open(t);
    const preview = watch.previewFile(raw);
    mutate(watch);
    const snapshot = watch.snapshot, saved = storage.raw;
    assert.throws(() => watch.restoreFile(preview), /changed|review/i);
    assert.equal(watch.snapshot, snapshot);
    assert.equal(storage.raw, saved);
  }
});

test("cancel, an older preview and a lookalike object cannot authorize replacement", t => {
  const raw = sample(t).watch.exportFile();
  const { watch, storage } = open(t);
  const cancelled = watch.previewFile(raw);
  watch.cancelFile();
  assert.throws(() => watch.restoreFile(cancelled), /changed|review/i);
  const older = watch.previewFile(raw);
  const current = watch.previewFile(raw);
  assert.throws(() => watch.restoreFile(older), /changed|review/i);
  assert.throws(() => watch.restoreFile({ ...current }), /changed|review/i);
  assert.equal(storage.raw, null);
  watch.restoreFile(current);
  assert.equal(storage.raw, raw);
  assert.throws(() => watch.restoreFile(current), /changed|review/i);
});

test("another tab changing storage during review prevents both active and stored replacement", t => {
  const raw = sample(t).watch.exportFile();
  const { watch, storage } = open(t);
  watch.takeTurn("gate");
  const preview = watch.previewFile(raw);
  const active = watch.snapshot;
  const other = open(t, storage).watch;
  other.takeTurn("shade");
  const winner = storage.raw;
  assert.throws(() => watch.restoreFile(preview), /saved watch changed|another tab/i);
  assert.equal(watch.snapshot, active);
  assert.equal(storage.raw, winner);
  const reviewedAgain = watch.previewFile(raw);
  watch.restoreFile(reviewedAgain);
  assert.equal(storage.raw, raw, "a fresh explicit review can choose replacement of the observed saved watch");
});

test("a protected save is kept through preview and replaced only by explicit confirmation", t => {
  const storage = new Storage();
  storage.raw = "unsupported older watch";
  const { watch } = open(t, storage);
  const raw = sample(t).watch.exportFile();
  const preview = watch.previewFile(raw);
  assert.equal(storage.raw, "unsupported older watch");
  assert.equal(watch.status.kind, "protected");
  watch.restoreFile(preview);
  assert.equal(storage.raw, raw);
  assert.equal(watch.status.kind, "saved");
});

test("quota or unreadable storage retains prior bytes while the opened watch can still be exported", t => {
  for (const failure of ["writesFail", "readsFail"]) {
    const { watch, storage } = open(t);
    watch.takeTurn("gate");
    const prior = storage.raw;
    const source = sample(t).watch;
    const raw = source.exportFile();
    const preview = watch.previewFile(raw);
    storage[failure] = true;
    watch.restoreFile(preview);
    assert.equal(watch.snapshot, source.snapshot);
    assert.equal(watch.exportFile(), raw);
    assert.equal(storage.raw, prior);
    assert.equal(watch.status.kind, "unavailable");
    storage[failure] = false;
    assert.equal(watch.save(), true);
    assert.equal(storage.raw, raw);
  }
});

test("storage unknown during preview is never silently replaced when it becomes readable", t => {
  const storage = sample(t).storage;
  const prior = storage.raw;
  storage.readsFail = true;
  const { watch } = open(t, storage);
  const source = open(t).watch;
  source.takeTurn("gate");
  const raw = source.exportFile();
  const preview = watch.previewFile(raw);
  storage.readsFail = false;
  watch.restoreFile(preview);
  assert.equal(watch.snapshot, source.snapshot);
  assert.equal(storage.raw, prior);
  assert.equal(watch.status.kind, "changed");
  assert.equal(watch.save(), false);
  watch.restoreFile(watch.previewFile(raw));
  assert.equal(storage.raw, raw);
});

test("existing journal replay remains read-only and includes every native tide", t => {
  const { watch, storage } = sample(t);
  const saved = storage.raw, writes = storage.writes, snapshot = watch.snapshot;
  const history = watch.replayHistory();
  assert.deepEqual(history.map(raw => JSON.parse(raw).day), [0, 1, 2, 3]);
  assert.equal(history.at(-1), snapshot);
  assert.equal(storage.raw, saved);
  assert.equal(storage.writes, writes);
});

test("existing two-tab protection still keeps the other watch when no file is opened", t => {
  const { watch, storage } = sample(t);
  const other = open(t, storage).watch;
  watch.takeTurn("shade");
  const winner = storage.raw;
  other.takeTurn("gate");
  assert.equal(storage.raw, winner);
  assert.equal(other.status.kind, "changed");
});
