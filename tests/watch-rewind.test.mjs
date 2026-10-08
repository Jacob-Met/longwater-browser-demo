import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { initSync, BrowserSession } from "../pkg/longwater_web.js";
import { SavedWatch, SIMULATION_REVISION, WATCH_SAVE_KEY } from "../watch-save.js";

initSync({ module: await readFile(new URL("../pkg/longwater_web_bg.wasm", import.meta.url)) });
const CELLS = ["north", "heart", "south"];
class Storage {
  raw = null;
  readFails = false;
  writeFails = false;
  writes = 0;
  getItem(key) {
    assert.equal(key, WATCH_SAVE_KEY);
    if (this.readFails) throw new Error("Authored unavailable storage");
    return this.raw;
  }
  setItem(key, raw) {
    assert.equal(key, WATCH_SAVE_KEY);
    if (this.writeFails) throw new Error("Authored quota refusal");
    this.writes++;
    this.raw = raw;
  }
}
function open(t, storage = new Storage(), createSession = () => new BrowserSession()) {
  const watch = new SavedWatch({ createSession, getStorage: () => storage });
  t.after(() => watch.free());
  return { watch, storage };
}
function nativeHistory(turns) {
  const native = new BrowserSession();
  try {
    const history = [native.snapshot_json()];
    for (const turn of turns) history.push(native.take_turn(turn.action, turn.cell));
    return history;
  } finally { native.free(); }
}
function file(turns, selected = "heart") {
  return JSON.stringify({ version: 1, simulation: SIMULATION_REVISION, turns,
    selected, snapshot: nativeHistory(turns).at(-1) });
}
function partial(watch) {
  const turns = [{ action: "gate", cell: "north" }, { action: "shade", cell: "south" },
    { action: "seed", cell: "heart" }];
  for (const turn of turns) {
    watch.select(CELLS.indexOf(turn.cell));
    watch.takeTurn(turn.action);
  }
  watch.select(0);
  return turns;
}
function unchanged(watch, storage) {
  return { active: watch.exportFile(), snapshot: watch.snapshot, selected: watch.selected,
    status: watch.status, saved: storage.raw, writes: storage.writes };
}

test("an opening watch has no rewind and preserves its unwritten state", t => {
  const { watch, storage } = open(t);
  const before = unchanged(watch, storage);
  assert.throws(() => watch.previewRewind(), /no completed tide/i);
  assert.deepEqual(unchanged(watch, storage), before);
});

test("review is detached, immutable, native-exact and read-only", t => {
  const { watch, storage } = open(t);
  const turns = partial(watch);
  const history = nativeHistory(turns);
  const before = unchanged(watch, storage);
  const review = watch.previewRewind();
  assert.ok(Object.isFrozen(review));
  assert.equal(review.day, 3);
  assert.equal(review.targetDay, 2);
  assert.equal(review.action, "seed");
  assert.equal(review.cell, "heart");
  assert.equal(review.cellName, "Heart Pool");
  assert.equal(review.selected, 0);
  assert.equal(review.selectedCell, "North Bank");
  assert.equal(review.currentSnapshot, history[3]);
  assert.equal(review.previousSnapshot, history[2]);
  assert.throws(() => { review.targetDay = 0; }, TypeError);
  assert.throws(() => watch.rewind({ ...review }), /review/i);
  assert.deepEqual(unchanged(watch, storage), before);
  watch.cancelRewind();
  assert.throws(() => watch.rewind(review), /review/i);
  assert.deepEqual(unchanged(watch, storage), before);
});

test("one confirmation adopts only the last prefix, preserves selection and saves exactly once", t => {
  const { watch, storage } = open(t);
  const turns = partial(watch);
  const history = nativeHistory(turns);
  const review = watch.previewRewind();
  const writes = storage.writes;
  assert.equal(watch.rewind(review), history[2]);
  assert.equal(watch.snapshot, history[2]);
  assert.equal(watch.selected, 0);
  assert.equal(storage.writes, writes + 1);
  assert.equal(storage.raw, file(turns.slice(0, 2), "north"));
  assert.deepEqual(watch.replayHistory(), history.slice(0, 3));
  const accepted = unchanged(watch, storage);
  assert.throws(() => watch.rewind(review), /review/i);
  assert.deepEqual(unchanged(watch, storage), accepted);
  const resumed = open(t, storage).watch;
  assert.equal(resumed.snapshot, history[2]);
  assert.equal(resumed.selected, 0);
});

test("opening and cancelling rewind keep an existing file review usable", t => {
  const { watch, storage } = open(t);
  partial(watch);
  const incoming = file([{ action: "shade", cell: "north" }], "south");
  const fileReview = watch.previewFile(incoming);
  const before = unchanged(watch, storage);
  watch.previewRewind();
  watch.cancelRewind();
  assert.deepEqual(unchanged(watch, storage), before);
  watch.restoreFile(fileReview);
  assert.equal(watch.exportFile(), incoming);
  assert.equal(storage.raw, incoming);
});

test("accepted rewind retires an older file review after adoption", t => {
  const { watch, storage } = open(t);
  const turns = partial(watch);
  const pending = watch.previewFile(file([]));
  watch.rewind(watch.previewRewind());
  const accepted = unchanged(watch, storage);
  assert.equal(watch.snapshot, nativeHistory(turns)[2]);
  assert.throws(() => watch.restoreFile(pending), /review/i);
  assert.deepEqual(unchanged(watch, storage), accepted);
});

test("file preview and cancellation do not retire a rewind review", t => {
  const { watch, storage } = open(t);
  const turns = partial(watch);
  const review = watch.previewRewind();
  watch.previewFile(file([]));
  watch.cancelFile();
  assert.equal(watch.rewind(review), nativeHistory(turns)[2]);
  assert.equal(JSON.parse(storage.raw).turns.length, 2);
});

test("failed actions, invalid selections and no-op selection retain the same review", t => {
  const { watch, storage } = open(t);
  watch.takeTurn("shade");
  watch.takeTurn("shade");
  watch.takeTurn("shade");
  const review = watch.previewRewind();
  const before = unchanged(watch, storage);
  assert.throws(() => watch.takeTurn("shade"));
  assert.throws(() => watch.takeTurn("not-an-action"));
  assert.throws(() => watch.select(3));
  assert.throws(() => watch.select("1"));
  watch.select(watch.selected);
  assert.deepEqual(unchanged(watch, storage), before);
  assert.equal(JSON.parse(watch.rewind(review)).day, 2);
});

test("successful turns and real selection changes invalidate even after returning to the old selection", t => {
  const { watch, storage } = open(t);
  partial(watch);
  const selectedReview = watch.previewRewind();
  watch.select(2);
  watch.select(0);
  const selected = unchanged(watch, storage);
  assert.throws(() => watch.rewind(selectedReview), /review/i);
  assert.deepEqual(unchanged(watch, storage), selected);
  const turnReview = watch.previewRewind();
  watch.takeTurn("shade");
  const played = unchanged(watch, storage);
  assert.throws(() => watch.rewind(turnReview), /review/i);
  assert.deepEqual(unchanged(watch, storage), played);
});

test("Reset and an identical confirmed file still retire old review identity", t => {
  const { watch, storage } = open(t);
  watch.takeTurn("shade");
  const first = watch.previewRewind();
  const original = watch.exportFile();
  watch.reset();
  watch.takeTurn("shade");
  assert.equal(watch.exportFile(), original);
  assert.throws(() => watch.rewind(first), /review/i);
  const second = watch.previewRewind();
  watch.restoreFile(watch.previewFile(original));
  const adopted = unchanged(watch, storage);
  assert.throws(() => watch.rewind(second), /review/i);
  assert.deepEqual(unchanged(watch, storage), adopted);
});

test("a later review supersedes only the prior review and forged tokens do not consume it", t => {
  const { watch } = open(t);
  partial(watch);
  const first = watch.previewRewind();
  const second = watch.previewRewind();
  assert.notEqual(first, second);
  assert.deepEqual(first, second);
  assert.throws(() => watch.rewind(first), /review/i);
  assert.throws(() => watch.rewind({ ...second }), /review/i);
  assert.equal(JSON.parse(watch.rewind(second)).day, 2);
});

test("observed storage events invalidate reviews even without changed bytes and while protected", t => {
  const { watch, storage } = open(t);
  partial(watch);
  const sameBytes = watch.previewRewind();
  watch.storageChanged();
  assert.throws(() => watch.rewind(sameBytes), /review/i);
  storage.raw = file([{ action: "gate", cell: "south" }]);
  watch.storageChanged();
  assert.equal(watch.status.kind, "changed");
  const protectedReview = watch.previewRewind();
  const before = unchanged(watch, storage);
  watch.storageChanged();
  assert.throws(() => watch.rewind(protectedReview), /review/i);
  assert.deepEqual(unchanged(watch, storage), before);
});

test("a protected unsupported save stays exact while the active watch is rewound", t => {
  const storage = new Storage();
  storage.raw = '{"version":999,"keep":"literal unsupported watch"}';
  const { watch } = open(t, storage);
  partial(watch);
  const raw = storage.raw;
  const writes = storage.writes;
  const review = watch.previewRewind();
  assert.equal(watch.status.kind, "protected");
  assert.equal(JSON.parse(watch.rewind(review)).day, 2);
  assert.equal(storage.raw, raw);
  assert.equal(storage.writes, writes);
  assert.equal(watch.status.kind, "protected");
  assert.equal(JSON.parse(watch.exportFile()).turns.length, 2);
});

test("an unobserved foreign save is kept after local prefix adoption", t => {
  const { watch, storage } = open(t);
  const turns = partial(watch);
  const review = watch.previewRewind();
  const foreign = file([{ action: "shade", cell: "north" }], "south");
  storage.raw = foreign;
  const writes = storage.writes;
  assert.equal(watch.rewind(review), nativeHistory(turns)[2]);
  assert.equal(storage.raw, foreign);
  assert.equal(storage.writes, writes);
  assert.equal(watch.status.kind, "changed");
  assert.equal(watch.status.canRetry, false);
});

test("a previously unreadable foreign store never gains rewind replacement permission", t => {
  const storage = new Storage();
  storage.readFails = true;
  storage.raw = file([{ action: "seed", cell: "south" }], "north");
  const { watch } = open(t, storage);
  watch.takeTurn("shade");
  const review = watch.previewRewind();
  const foreign = storage.raw;
  storage.readFails = false;
  assert.equal(JSON.parse(watch.rewind(review)).day, 0);
  assert.equal(storage.raw, foreign);
  assert.equal(storage.writes, 0);
  assert.equal(watch.status.kind, "changed");
});

test("a refused save leaves the accepted rewind exportable and the ordinary retry saves it", t => {
  const { watch, storage } = open(t);
  const turns = partial(watch);
  const review = watch.previewRewind();
  const previousSaved = storage.raw;
  const writes = storage.writes;
  storage.writeFails = true;
  assert.equal(watch.rewind(review), nativeHistory(turns)[2]);
  assert.equal(storage.raw, previousSaved);
  assert.equal(storage.writes, writes);
  assert.equal(watch.status.kind, "unavailable");
  assert.equal(watch.status.canRetry, true);
  assert.equal(watch.exportFile(), file(turns.slice(0, 2), "north"));
  storage.writeFails = false;
  assert.equal(watch.save(), true);
  assert.equal(storage.writes, writes + 1);
  assert.equal(storage.raw, watch.exportFile());
  assert.equal(watch.status.kind, "saved");
});

test("the completed watch rewinds through every exact native prefix, one confirmation at a time", t => {
  const { watch } = open(t);
  const native = new BrowserSession();
  const history = [native.snapshot_json()];
  const turns = [];
  try {
    while (!JSON.parse(native.snapshot_json()).finished) {
      const state = JSON.parse(native.snapshot_json());
      const available = state.cells.findIndex(cell => cell.shade < 3);
      const index = available < 0 ? 0 : available;
      const action = available >= 0 ? "shade" : state.freshwater > 0 ? "gate" : "seed";
      const turn = { action, cell: CELLS[index] };
      turns.push(turn);
      history.push(native.take_turn(action, turn.cell));
      watch.select(index);
      assert.equal(watch.takeTurn(action), history.at(-1));
    }
    assert.equal(turns.length, 14);
    const selected = watch.selected;
    for (let target = 13; target >= 0; target--) {
      const review = watch.previewRewind();
      assert.equal(review.day, target + 1);
      assert.equal(review.targetDay, target);
      assert.equal(watch.rewind(review), history[target]);
      assert.equal(watch.selected, selected);
      const saved = JSON.parse(watch.exportFile());
      assert.deepEqual(saved.turns, turns.slice(0, target));
      assert.equal(saved.snapshot, history[target]);
      assert.equal(JSON.parse(saved.snapshot).finished, false);
    }
    assert.throws(() => watch.previewRewind(), /no completed tide/i);
  } finally { native.free(); }
});

test("play after rewind appends only the new choice to the shorter history", t => {
  const { watch } = open(t);
  const turns = partial(watch);
  watch.rewind(watch.previewRewind());
  const replacement = { action: "shade", cell: "north" };
  const expected = turns.slice(0, 2).concat(replacement);
  assert.equal(watch.takeTurn("shade"), nativeHistory(expected).at(-1));
  assert.equal(watch.exportFile(), file(expected, "north"));
});

function tracking() {
  const handles = new Set();
  const all = [];
  let failAllocation = false;
  let failTurn = 0;
  return {
    get live() { return handles.size; },
    get activeNative() { return all[0]; },
    failNextAllocation() { failAllocation = true; },
    failNextReplayAt(turn) { failTurn = turn; },
    create() {
      if (failAllocation) { failAllocation = false; throw new Error("Authored native allocation refusal"); }
      const native = new BrowserSession();
      all.push(native);
      const refusedTurn = failTurn;
      failTurn = 0;
      let calls = 0;
      let freed = false;
      const wrapped = {
        snapshot_json() { assert.equal(freed, false); return native.snapshot_json(); },
        take_turn(action, cell) {
          assert.equal(freed, false);
          if (++calls === refusedTurn) throw new Error("Authored native replay refusal");
          return native.take_turn(action, cell);
        },
        restart() { assert.equal(freed, false); return native.restart(); },
        free() {
          assert.equal(freed, false, "each native handle is freed exactly once");
          freed = true;
          native.free();
          handles.delete(wrapped);
        },
      };
      handles.add(wrapped);
      return wrapped;
    },
  };
}

test("a failed prefix replay frees its candidate and preserves active state and pending file", t => {
  const tracked = tracking();
  const { watch, storage } = open(t, new Storage(), () => tracked.create());
  partial(watch);
  const incoming = file([{ action: "shade", cell: "north" }], "south");
  const fileReview = watch.previewFile(incoming);
  const review = watch.previewRewind();
  assert.equal(tracked.live, 1, "preview sessions have already been released");
  const before = unchanged(watch, storage);
  tracked.failNextReplayAt(2);
  assert.throws(() => watch.rewind(review), /authored native replay refusal/i);
  assert.deepEqual(unchanged(watch, storage), before);
  assert.equal(tracked.live, 1);
  assert.throws(() => watch.rewind(review), /review/i, "failed review is consumed");
  watch.restoreFile(fileReview);
  assert.equal(watch.exportFile(), incoming);
  assert.equal(tracked.live, 1);
});

test("a refused preview allocation preserves state and the independent file token", t => {
  const tracked = tracking();
  const { watch, storage } = open(t, new Storage(), () => tracked.create());
  partial(watch);
  const incoming = file([]);
  const fileReview = watch.previewFile(incoming);
  const before = unchanged(watch, storage);
  tracked.failNextAllocation();
  assert.throws(() => watch.previewRewind(), /allocation refusal/i);
  assert.deepEqual(unchanged(watch, storage), before);
  assert.equal(tracked.live, 1);
  watch.restoreFile(fileReview);
  assert.equal(watch.exportFile(), incoming);
});

test("same-length but mismatching full native history is refused without mutation", t => {
  const tracked = tracking();
  const { watch, storage } = open(t, new Storage(), () => tracked.create());
  watch.takeTurn("shade");
  // Deliberately alter the receiver-owned native handle without recording an
  // accepted action: equal day counts alone must not admit a rewind.
  tracked.activeNative.restart();
  tracked.activeNative.take_turn("gate", "south");
  assert.equal(JSON.parse(watch.snapshot).day, 1);
  assert.equal(JSON.parse(watch.exportFile()).turns.length, 1);
  const before = unchanged(watch, storage);
  assert.throws(() => watch.previewRewind(), /history does not match/i);
  assert.deepEqual(unchanged(watch, storage), before);
  assert.equal(tracked.live, 1);
});

test("disposal retires the token before any confirmation can touch the freed native session", () => {
  const tracked = tracking();
  const storage = new Storage();
  const watch = new SavedWatch({ createSession: () => tracked.create(), getStorage: () => storage });
  partial(watch);
  const review = watch.previewRewind();
  const raw = storage.raw;
  const writes = storage.writes;
  watch.free();
  assert.equal(tracked.live, 0);
  assert.throws(() => watch.rewind(review), /review/i);
  assert.equal(tracked.live, 0);
  assert.equal(storage.raw, raw);
  assert.equal(storage.writes, writes);
});
