import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { initSync, BrowserSession } from "../pkg/longwater_web.js";
import { MAX_SAVE_LENGTH, SavedWatch, SIMULATION_REVISION, WATCH_SAVE_KEY } from "../watch-save.js";

const wasm = await readFile(new URL("../pkg/longwater_web_bg.wasm", import.meta.url));
initSync({ module: wasm });

class MemoryStorage {
  raw = null;
  readsFail = false;
  writesFail = false;
  writes = 0;
  getItem(key) {
    assert.equal(key, WATCH_SAVE_KEY);
    if (this.readsFail) throw new Error("Storage access denied.");
    return this.raw;
  }
  setItem(key, value) {
    assert.equal(key, WATCH_SAVE_KEY);
    if (this.writesFail) throw new Error("Quota exceeded.");
    this.raw = value;
    this.writes++;
  }
}

function open(t, storage = new MemoryStorage(), options = {}) {
  const watch = new SavedWatch({ createSession: () => new BrowserSession(), getStorage: () => storage, ...options });
  t.after(() => watch.free());
  return watch;
}

function sample(t, storage = new MemoryStorage()) {
  const watch = open(t, storage);
  watch.takeTurn("shade");
  watch.select(0);
  watch.takeTurn("gate");
  watch.select(2);
  watch.takeTurn("seed");
  return { watch, storage };
}

function finish(watch) {
  while (!JSON.parse(watch.snapshot).finished) {
    const state = JSON.parse(watch.snapshot);
    const cell = state.cells.findIndex(item => item.shade < 3);
    watch.select(cell < 0 ? 0 : cell);
    watch.takeTurn(cell >= 0 ? "shade" : state.freshwater > 0 ? "gate" : "seed");
  }
}

test("the save revision pins the actual shipped WASM bytes", () => {
  assert.equal(createHash("sha256").update(wasm).digest("hex"), SIMULATION_REVISION);
});

test("a new watch does not write until the player chooses a cell or tide", t => {
  const storage = new MemoryStorage();
  const watch = open(t, storage);
  assert.equal(watch.status.kind, "ready");
  assert.equal(JSON.parse(watch.snapshot).day, 0);
  assert.equal(watch.selected, 1);
  assert.equal(storage.writes, 0);
  watch.select(2);
  assert.equal(JSON.parse(storage.raw).selected, "south");
  assert.deepEqual(JSON.parse(storage.raw).turns, []);
});

test("reload replays actual accepted tides and restores the exact complete state and selection", t => {
  const { watch, storage } = sample(t);
  const saved = storage.raw;
  const writes = storage.writes;
  const resumed = open(t, storage);
  assert.equal(resumed.status.kind, "resumed");
  assert.equal(resumed.snapshot, watch.snapshot);
  assert.equal(resumed.selected, 2);
  assert.equal(JSON.parse(resumed.snapshot).day, 3);
  assert.equal(storage.raw, saved);
  assert.equal(storage.writes, writes, "opening a saved watch does not rewrite it");
  const expected = new BrowserSession();
  t.after(() => expected.free());
  expected.take_turn("shade", "heart");
  expected.take_turn("gate", "north");
  expected.take_turn("seed", "south");
  assert.equal(resumed.takeTurn("shade"), expected.take_turn("shade", "south"));
});

test("a completed fourteen-tide watch and its outcome survive reopening", t => {
  const storage = new MemoryStorage();
  const watch = open(t, storage);
  finish(watch);
  const state = JSON.parse(watch.snapshot);
  assert.equal(state.day, 14);
  assert.equal(state.finished, true);
  assert.equal(JSON.parse(storage.raw).turns.length, 14);
  const resumed = open(t, storage);
  assert.equal(resumed.snapshot, watch.snapshot);
  assert.equal(JSON.parse(resumed.snapshot).outcome, state.outcome);
  const raw = storage.raw;
  assert.throws(() => resumed.takeTurn("gate"), /complete/i);
  assert.equal(storage.raw, raw);
});

test("refused actions are absent from storage and do not change native state", t => {
  const storage = new MemoryStorage();
  const watch = open(t, storage);
  for (let index = 0; index < 3; index++) watch.takeTurn("shade");
  const snapshot = watch.snapshot;
  const raw = storage.raw;
  const writes = storage.writes;
  assert.throws(() => watch.takeTurn("shade"), /maximum/i);
  assert.throws(() => watch.takeTurn("unknown"), /unknown/i);
  assert.throws(() => watch.select(-1), /unknown/i);
  assert.equal(watch.snapshot, snapshot);
  assert.equal(storage.raw, raw);
  assert.equal(storage.writes, writes);
  assert.equal(JSON.parse(raw).turns.length, 3);
});

test("explicit reset persists a fresh watch that cannot resurrect the old history", t => {
  const { watch, storage } = sample(t);
  const fresh = watch.reset();
  assert.equal(JSON.parse(fresh).day, 0);
  assert.deepEqual(JSON.parse(storage.raw).turns, []);
  assert.equal(watch.selected, 1);
  const resumed = open(t, storage);
  assert.equal(resumed.snapshot, fresh);
  assert.equal(resumed.selected, 1);
});

test("malformed, unsupported, overlong and tampered saves remain byte-for-byte intact", t => {
  const { storage: good } = sample(t);
  const edit = change => {
    const save = JSON.parse(good.raw);
    change(save);
    return JSON.stringify(save);
  };
  const invalid = [
    "not json", "null", "[]", " ".repeat(MAX_SAVE_LENGTH + 1),
    edit(save => { save.version = 2; }),
    edit(save => { save.simulation = "different simulation"; }),
    edit(save => { save.extra = true; }),
    edit(save => { save.selected = "elsewhere"; }),
    edit(save => { save.turns[0].action = "invented"; }),
    edit(save => { save.turns[0].cell = "elsewhere"; }),
    edit(save => { save.turns[0].extra = true; }),
    edit(save => { save.turns = Array.from({ length: 15 }, () => ({ action: "gate", cell: "heart" })); }),
    edit(save => { save.snapshot = save.snapshot.replace('"day":3', '"day":12'); }),
    edit(save => { save.snapshot = {}; }),
    edit(save => { save.turns[0].cell = "north"; }),
    edit(save => { save.turns = Array.from({ length: 4 }, () => ({ action: "shade", cell: "heart" })); }),
  ];
  for (const raw of invalid) {
    const storage = new MemoryStorage();
    storage.raw = raw;
    const watch = open(t, storage);
    assert.equal(watch.status.kind, "protected");
    assert.equal(JSON.parse(watch.snapshot).day, 0, "failed partial replay never becomes player state");
    watch.takeTurn("gate");
    assert.equal(JSON.parse(watch.snapshot).day, 1, "play can continue without replacing the failed save");
    assert.equal(storage.raw, raw);
    assert.equal(storage.writes, 0);
  }
});

test("failed partial native replay frees its candidate and explicit reset replaces a protected save", t => {
  const storage = new MemoryStorage();
  const { storage: good } = sample(t);
  const invalid = JSON.parse(good.raw);
  invalid.turns = Array.from({ length: 4 }, () => ({ action: "shade", cell: "heart" }));
  storage.raw = JSON.stringify(invalid);
  let freed = 0;
  const watch = open(t, storage, { createSession: () => {
    const native = new BrowserSession();
    return {
      snapshot_json: () => native.snapshot_json(),
      take_turn: (action, cell) => native.take_turn(action, cell),
      restart: () => native.restart(),
      free: () => { freed++; native.free(); },
    };
  } });
  assert.equal(freed, 1);
  watch.reset();
  assert.equal(watch.status.kind, "saved");
  assert.equal(JSON.parse(storage.raw).turns.length, 0);
  assert.equal(open(t, storage).snapshot, watch.snapshot);
});

test("a storage quota failure keeps play in memory and retry saves exactly once without replaying a tide", t => {
  const { watch, storage } = sample(t);
  const prior = storage.raw;
  storage.writesFail = true;
  const snapshot = watch.takeTurn("shade");
  assert.equal(watch.status.kind, "unavailable");
  assert.equal(watch.status.canRetry, true);
  assert.equal(storage.raw, prior);
  assert.equal(JSON.parse(snapshot).day, 4);
  storage.writesFail = false;
  assert.equal(watch.save(), true);
  assert.equal(watch.snapshot, snapshot);
  assert.equal(JSON.parse(storage.raw).turns.length, 4);
  assert.equal(open(t, storage).snapshot, snapshot);
});

test("an unavailable localStorage getter does not prevent play and can later recover", t => {
  const storage = new MemoryStorage();
  let denied = true;
  const watch = open(t, storage, { getStorage: () => {
    if (denied) throw new Error("SecurityError");
    return storage;
  } });
  watch.takeTurn("shade");
  assert.equal(watch.status.kind, "unavailable");
  assert.equal(JSON.parse(watch.snapshot).day, 1);
  denied = false;
  assert.equal(watch.save(), true);
  assert.equal(open(t, storage).snapshot, watch.snapshot);
});

test("retry after unreadable storage never overwrites a previously unknown saved watch", t => {
  const { storage } = sample(t);
  const original = storage.raw;
  storage.readsFail = true;
  const watch = open(t, storage);
  watch.takeTurn("shade");
  storage.readsFail = false;
  assert.equal(watch.save(), false);
  assert.equal(watch.status.kind, "changed");
  assert.equal(storage.raw, original);
  watch.reset();
  assert.equal(watch.status.kind, "saved");
  assert.equal(JSON.parse(storage.raw).turns.length, 0);
});

test("a stale tab detects another saved watch before writing its divergent tide", t => {
  const { storage } = sample(t);
  const first = open(t, storage);
  const second = open(t, storage);
  first.takeTurn("shade");
  const winner = storage.raw;
  second.takeTurn("gate");
  assert.equal(second.status.kind, "changed");
  assert.equal(second.status.canRetry, false);
  assert.equal(storage.raw, winner);
  assert.notEqual(second.snapshot, first.snapshot);
  second.reset();
  assert.equal(JSON.parse(storage.raw).turns.length, 0);
  first.storageChanged();
  assert.equal(first.status.kind, "changed");
});

test("storage change and clear notifications hold stale writes without mutating the current watch", t => {
  for (const replacement of [null, "other saved data"]) {
    const { watch, storage } = sample(t);
    const snapshot = watch.snapshot;
    storage.raw = replacement;
    watch.storageChanged();
    assert.equal(watch.status.kind, "changed");
    assert.equal(watch.snapshot, snapshot);
    assert.equal(watch.save(), false);
    assert.equal(storage.raw, replacement);
  }
});

test("a failed reset write reports the unsaved state and retry cannot restore old actions", t => {
  const { watch, storage } = sample(t);
  const previous = storage.raw;
  storage.writesFail = true;
  watch.reset();
  assert.equal(watch.status.kind, "unavailable");
  assert.equal(JSON.parse(watch.snapshot).day, 0);
  assert.equal(storage.raw, previous);
  storage.writesFail = false;
  watch.save();
  assert.deepEqual(JSON.parse(storage.raw).turns, []);
  assert.equal(JSON.parse(open(t, storage).snapshot).day, 0);
});
