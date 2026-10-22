import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { initSync, BrowserSession } from "../pkg/longwater_web.js";
import { SavedWatch, WATCH_SAVE_KEY } from "../watch-save.js";
import { SavedWatchShelf, inspectShelfWatch, WATCH_SHELF_KEY, MAX_SHELF_BYTES } from "../watch-shelf-model.js";

initSync({ module: await readFile(new URL("../pkg/longwater_web_bg.wasm", import.meta.url)) });
const names = ["north", "heart", "south"];
const idFor = number => "00000000-0000-4000-8000-" + String(number).padStart(12, "0");

class Storage {
  raw = null;
  readsFail = false;
  writesFail = false;
  writes = 0;
  afterWrite = null;
  getItem(key) {
    assert.equal(key, WATCH_SHELF_KEY, "shelf operations use only their own key");
    if (this.readsFail) throw new Error("Read denied.");
    return this.raw;
  }
  setItem(key, value) {
    assert.equal(key, WATCH_SHELF_KEY);
    if (this.writesFail) throw new Error("Quota exceeded.");
    this.raw = value;
    this.writes++;
    this.afterWrite?.();
  }
}

function tracked(t, failTurn = false) {
  const living = new Set();
  t.after(() => assert.equal(living.size, 0, "no native session leaked"));
  return () => {
    const native = new BrowserSession();
    living.add(native);
    return {
      snapshot_json: () => native.snapshot_json(),
      take_turn(action, cell) {
        if (failTurn) throw new Error("Injected native replay failure.");
        return native.take_turn(action, cell);
      },
      restart: () => native.restart(),
      free() { assert.ok(living.delete(native)); native.free(); },
    };
  };
}

function fixture(turns = [["shade", "heart"], ["gate", "north"], ["seed", "south"]], selected = 2) {
  const native = new BrowserSession();
  const memory = { raw: null, getItem() { return this.raw; }, setItem(_key, raw) { this.raw = raw; } };
  const watch = new SavedWatch({ createSession: () => new BrowserSession(), getStorage: () => memory });
  try {
    for (const [action, cell] of turns) {
      watch.select(names.indexOf(cell));
      assert.equal(watch.takeTurn(action), native.take_turn(action, cell), "saved history matches a separately played native session");
    }
    watch.select(selected);
    return { raw: watch.exportFile(), snapshot: native.snapshot_json(), selected, day: turns.length };
  } finally { watch.free(); native.free(); }
}

function open(t, storage = new Storage(), options = {}) {
  let id = 0;
  const shelf = new SavedWatchShelf({
    getStorage: () => storage, createSession: tracked(t), createId: () => idFor(++id), ...options,
  });
  shelf.refresh();
  return { shelf, storage };
}

test("keeps exact native files, including day zero, without writing on open or refresh", t => {
  const { shelf, storage } = open(t);
  assert.equal(storage.raw, null);
  assert.equal(storage.writes, 0);
  const first = fixture([], 2);
  const second = fixture();
  shelf.keep("Opening south", first.raw);
  shelf.keep("Three tides", second.raw);
  const stored = JSON.parse(storage.raw);
  assert.equal(stored.entries[0].watch, first.raw);
  assert.equal(stored.entries[1].watch, second.raw);
  assert.equal(shelf.state.entries[0].day, 0);
  assert.equal(shelf.state.entries[0].cell, "South Reach");
  assert.equal(shelf.state.entries[1].day, 3);
  assert.equal(shelf.state.entries[1].cell, "South Reach");
  assert.equal(shelf.state.entries[1].valid, true);
  const bytes = storage.raw;
  const reopened = open(t, storage).shelf;
  assert.deepEqual(reopened.state.entries, shelf.state.entries);
  reopened.refresh();
  assert.equal(storage.raw, bytes);
  assert.equal(storage.writes, 2);
});

test("duplicate names retain independent IDs and rename changes only one selected entry", t => {
  const { shelf, storage } = open(t);
  const a = fixture([], 0), b = fixture();
  const first = shelf.keep("My watch", a.raw);
  const second = shelf.keep("My watch", b.raw);
  assert.notEqual(first, second);
  shelf.rename(second, "Kept after three tides");
  const entries = JSON.parse(storage.raw).entries;
  assert.deepEqual(entries[0], { id: first, name: "My watch", watch: a.raw });
  assert.deepEqual(entries[1], { id: second, name: "Kept after three tides", watch: b.raw });
  const writes = storage.writes;
  shelf.rename(second, "Kept after three tides");
  assert.equal(storage.writes, writes, "identical name is a no-op");
});

test("shelf inspection and cancellation preserve a live pending file preview and primary save", t => {
  const candidate = fixture();
  const memory = { raw: null, writes: 0, getItem(key) { assert.equal(key, WATCH_SAVE_KEY); return this.raw; }, setItem(key, raw) { assert.equal(key, WATCH_SAVE_KEY); this.raw = raw; this.writes++; } };
  const live = new SavedWatch({ createSession: () => new BrowserSession(), getStorage: () => memory });
  t.after(() => live.free());
  live.takeTurn("shade");
  const pending = live.previewFile(candidate.raw);
  const before = { snapshot: live.snapshot, selected: live.selected, raw: memory.raw, writes: memory.writes };
  const { shelf, storage } = open(t);
  const id = shelf.keep("Native copy", candidate.raw);
  const token = shelf.reviewOpen(id);
  const remove = shelf.reviewRemove(id);
  shelf.cancelReview(remove);
  assert.equal(shelf.isCurrent(token), true);
  shelf.refresh();
  assert.equal(shelf.isCurrent(token), true, "read-only unchanged refresh preserves open source");
  const inspector = inspectShelfWatch(token.watch, tracked(t));
  assert.equal(inspector.day, 3);
  assert.deepEqual({ snapshot: live.snapshot, selected: live.selected, raw: memory.raw, writes: memory.writes }, before);
  const shelfBytes = storage.raw;
  live.restoreFile(pending);
  assert.equal(live.snapshot, candidate.snapshot);
  assert.equal(live.selected, candidate.selected);
  assert.equal(live.replayHistory().length, 4);
  assert.equal(storage.raw, shelfBytes);
});

test("explicit removal is identity-bound; cancellation and repeated confirmation cannot remove another entry", t => {
  const { shelf, storage } = open(t);
  const raw = fixture().raw;
  const first = shelf.keep("Same name", raw);
  const second = shelf.keep("Same name", raw);
  const canceled = shelf.reviewRemove(first);
  const untouched = storage.raw;
  shelf.cancelReview(canceled);
  assert.throws(() => shelf.remove(canceled), /no longer current/);
  assert.equal(storage.raw, untouched);
  const token = shelf.reviewRemove(second);
  assert.throws(() => shelf.remove({ ...token }), /no longer current/, "a copied object is not the reviewed token");
  shelf.remove(token);
  assert.deepEqual(JSON.parse(storage.raw).entries, [{ id: first, name: "Same name", watch: raw }]);
  const remaining = storage.raw;
  assert.throws(() => shelf.remove(token), /no longer current/);
  assert.equal(storage.raw, remaining);
});

test("open reviews refuse unknown identities and cannot authorize removal", t => {
  const { shelf, storage } = open(t);
  const id = shelf.keep("One", fixture().raw);
  const before = storage.raw;
  assert.throws(() => shelf.reviewOpen(idFor(99)), /no longer available/);
  const token = shelf.reviewOpen(id);
  assert.equal(Object.isFrozen(token), true);
  assert.throws(() => shelf.remove(token), /no longer current/);
  assert.equal(shelf.isCurrent({ ...token }), false);
  shelf.cancelReview(token);
  assert.equal(shelf.isCurrent(token), false);
  assert.equal(storage.raw, before);
});

test("names are literal Unicode text, with a code-point bound and no control characters", t => {
  const { shelf, storage } = open(t);
  const raw = fixture([], 1).raw;
  const literal = "🦆".repeat(60);
  shelf.keep("  " + literal + "  ", raw);
  shelf.keep("<img src=x onerror=alert(1)> & reeds", raw);
  assert.equal(shelf.state.entries[0].name, literal);
  assert.equal(shelf.state.entries[1].name, "<img src=x onerror=alert(1)> & reeds");
  for (const invalid of ["", "  ", "🦆".repeat(61), "north\nsouth", "a\u0000b", "a\u0085b", "\ud800"]) {
    const before = storage.raw;
    assert.throws(() => shelf.keep(invalid, raw));
    assert.equal(storage.raw, before);
  }
});

test("the twelfth entry fits and a thirteenth refuses without eviction", t => {
  const { shelf, storage } = open(t);
  const raw = fixture([], 0).raw;
  for (let index = 0; index < 12; index++) shelf.keep("Watch " + index, raw);
  const before = storage.raw;
  assert.equal(shelf.state.count, 12);
  assert.throws(() => shelf.keep("Thirteenth", raw), /12 watches/);
  assert.equal(storage.raw, before);
  assert.equal(storage.writes, 12);
});

test("watch and whole-shelf limits count actual UTF-8 bytes", t => {
  const { shelf, storage } = open(t);
  const raw = fixture().raw;
  const padded = raw + " ".repeat(32768 - Buffer.byteLength(raw));
  assert.equal(Buffer.byteLength(padded), 32768);
  assert.equal(inspectShelfWatch(padded, tracked(t)).day, 3);
  assert.throws(() => inspectShelfWatch(padded + " ", tracked(t)), /32 KB/);
  for (let index = 0; index < 7; index++) shelf.keep("Large " + index, padded);
  assert.ok(Buffer.byteLength(storage.raw) <= MAX_SHELF_BYTES);
  const before = storage.raw;
  assert.throws(() => shelf.keep("Eighth large watch", padded), /256 KB/);
  assert.equal(storage.raw, before);
  assert.equal(shelf.state.count, 7);
});

test("invalid envelope, unknown version, duplicate identity and oversized data are preserved", t => {
  const raw = fixture().raw;
  const entry = { id: idFor(1), name: "One", watch: raw };
  for (const broken of [
    "{", JSON.stringify({ version: 2, entries: [] }),
    JSON.stringify({ version: 1, entries: [], extra: true }),
    JSON.stringify({ version: 1, entries: [entry, { ...entry, id: entry.id.toUpperCase() }] }),
    JSON.stringify({ version: 1, entries: [{ ...entry, watch: "x".repeat(32769) }] }),
    " ".repeat(MAX_SHELF_BYTES + 1),
  ]) {
    const storage = new Storage(); storage.raw = broken;
    const shelf = open(t, storage).shelf;
    assert.equal(shelf.state.kind, "protected");
    assert.throws(() => shelf.keep("Safe", raw));
    assert.equal(storage.raw, broken);
    assert.equal(storage.writes, 0);
  }
});

test("an invalid inner watch is visible and cannot open; explicit rename/removal preserves other entries", t => {
  const valid = fixture().raw;
  const storage = new Storage();
  const broken = JSON.parse(valid); broken.snapshot += " ";
  storage.raw = JSON.stringify({ version: 1, entries: [
    { id: idFor(1), name: "Broken", watch: JSON.stringify(broken) },
    { id: idFor(2), name: "Good", watch: valid },
  ] });
  const { shelf } = open(t, storage);
  assert.equal(shelf.state.kind, "ready");
  assert.equal(shelf.state.entries[0].valid, false);
  assert.equal(shelf.state.entries[1].valid, true);
  assert.throws(() => shelf.reviewOpen(idFor(1)), /could not be replayed/);
  shelf.rename(idFor(1), "Retained unreadable watch");
  assert.equal(JSON.parse(storage.raw).entries[0].watch, JSON.stringify(broken));
  shelf.remove(shelf.reviewRemove(idFor(1)));
  assert.deepEqual(JSON.parse(storage.raw).entries, [{ id: idFor(2), name: "Good", watch: valid }]);
});

test("unavailable storage refuses changes until an explicit successful refresh", t => {
  const storage = new Storage(); storage.readsFail = true;
  const { shelf } = open(t, storage);
  assert.equal(shelf.state.kind, "unavailable");
  assert.throws(() => shelf.keep("One", fixture().raw));
  assert.equal(storage.writes, 0);
  storage.readsFail = false;
  assert.throws(() => shelf.keep("One", fixture().raw), "recovery is not assumed without a read");
  shelf.refresh();
  shelf.keep("One", fixture().raw);
  assert.equal(shelf.state.count, 1);
});

test("quota failure and unconfirmed writes never report a successful keep", t => {
  const { shelf, storage } = open(t);
  const raw = fixture().raw;
  shelf.keep("Existing", raw);
  const before = storage.raw;
  storage.writesFail = true;
  assert.throws(() => shelf.keep("No room", raw), /could not be saved/);
  assert.equal(storage.raw, before);
  assert.equal(shelf.state.kind, "unavailable");
  storage.writesFail = false;
  shelf.refresh();
  storage.afterWrite = () => { storage.readsFail = true; };
  assert.throws(() => shelf.keep("Unknown result", raw), /could not be confirmed/);
  assert.equal(shelf.state.kind, "unavailable");
  storage.afterWrite = null; storage.readsFail = false;
  shelf.refresh();
  assert.equal(shelf.state.count, 2, "refresh reveals the actual successful-but-unconfirmed write");
});

test("foreign writes between source reads refuse keep, rename and reviewed removal", t => {
  const raw = fixture().raw;
  for (const operation of ["keep", "rename", "remove"]) {
    const { shelf, storage } = open(t);
    const id = shelf.keep("One", raw);
    const token = shelf.reviewRemove(id);
    const foreign = JSON.stringify({ version: 1, entries: [{ id: idFor(99), name: "Other tab", watch: raw }] });
    storage.raw = foreign;
    assert.throws(() => operation === "keep" ? shelf.keep("New", raw)
      : operation === "rename" ? shelf.rename(id, "New name") : shelf.remove(token));
    assert.equal(storage.raw, foreign);
    assert.equal(shelf.state.kind, "changed");
    shelf.refresh();
    assert.equal(shelf.state.entries[0].id, idFor(99));
  }
});

test("source reviews become stale after own edits, unobserved foreign edits, failed reads or an observed ABA event", t => {
  const raw = fixture().raw;
  for (const change of ["rename", "foreign", "unavailable", "observed-aba"]) {
    const { shelf, storage } = open(t);
    const id = shelf.keep("One", raw);
    const token = shelf.reviewOpen(id);
    assert.equal(shelf.isCurrent(token), true);
    if (change === "rename") shelf.rename(id, "Renamed");
    if (change === "foreign") storage.raw = JSON.stringify({ version: 1, entries: [] });
    if (change === "unavailable") storage.readsFail = true;
    if (change === "observed-aba") { shelf.storageChanged(); shelf.refresh(); }
    assert.equal(shelf.isCurrent(token), false, change);
  }
});

test("a native replay failure frees every allocated session and cannot create a shelf entry", t => {
  const { shelf, storage } = open(t, new Storage(), { createSession: tracked(t, true) });
  assert.throws(() => shelf.keep("Cannot replay", fixture().raw), /could not be replayed/);
  assert.equal(storage.raw, null);
  assert.equal(storage.writes, 0);
});

test("failed or duplicate ID generation never replaces an existing entry", t => {
  const raw = fixture().raw;
  const storage = new Storage();
  const { shelf } = open(t, storage, { createId: () => idFor(1) });
  shelf.keep("One", raw);
  const before = storage.raw;
  assert.throws(() => shelf.keep("Duplicate identity", raw), /unique/);
  assert.equal(storage.raw, before);
  const failed = open(t, storage, { createId() { throw new Error("No entropy"); } }).shelf;
  assert.throws(() => failed.keep("No ID", raw), /could not be identified/);
  assert.equal(storage.raw, before);
});

test("a foreign write during native inspection is checked again before commit", t => {
  const storage = new Storage();
  let change = false;
  const native = tracked(t);
  const { shelf } = open(t, storage, { createSession() { if (change) storage.raw = '{"version":1,"entries":[]}'; return native(); } });
  change = true;
  assert.throws(() => shelf.keep("One", fixture().raw), /shelf changed/);
  assert.equal(storage.raw, '{"version":1,"entries":[]}');
  assert.equal(storage.writes, 0);
});

test("a completed watch retains its exact accepted history, selection and native outcome", t => {
  const memory = { raw: null, getItem() { return this.raw; }, setItem(_key, raw) { this.raw = raw; } };
  const watch = new SavedWatch({ createSession: () => new BrowserSession(), getStorage: () => memory });
  try {
    while (!JSON.parse(watch.snapshot).finished) {
      const state = JSON.parse(watch.snapshot);
      const cell = state.cells.findIndex(item => item.shade < 3);
      watch.select(cell < 0 ? 0 : cell);
      watch.takeTurn(cell >= 0 ? "shade" : state.freshwater > 0 ? "gate" : "seed");
    }
    const raw = watch.exportFile(), expected = JSON.parse(watch.snapshot);
    const { shelf, storage } = open(t);
    const id = shelf.keep("Fourteen tides", raw);
    assert.equal(shelf.state.entries[0].day, 14);
    assert.equal(shelf.state.entries[0].finished, true);
    assert.equal(shelf.state.entries[0].outcome, expected.outcome);
    assert.equal(shelf.reviewOpen(id).watch, raw);
    assert.equal(JSON.parse(storage.raw).entries[0].watch, raw);
  } finally { watch.free(); }
});

test("readback detects a writer that replaces the newly written shelf", t => {
  const { shelf, storage } = open(t);
  const foreign = '{"version":1,"entries":[]}';
  storage.afterWrite = () => { storage.raw = foreign; };
  assert.throws(() => shelf.keep("Lost race", fixture().raw), /changed while saving/);
  assert.equal(storage.raw, foreign);
  assert.equal(shelf.state.kind, "changed");
});
