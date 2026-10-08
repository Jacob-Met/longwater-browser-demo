import { SavedWatch, WATCH_SAVE_KEY, MAX_SAVE_LENGTH } from "./watch-save.js";

export const WATCH_SHELF_KEY = "longwater.shelf.v1";
export const MAX_SHELF_ENTRIES = 12;
export const MAX_SHELF_BYTES = 262144;
export const MAX_SHELF_NAME = 60;
const encoder = new TextEncoder();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function exactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every(key => Object.hasOwn(value, key));
}

function nameFor(value) {
  if (typeof value !== "string") throw new Error("Give this watch a name.");
  const name = value.trim();
  if (!name) throw new Error("Give this watch a name.");
  if ([...name].length > MAX_SHELF_NAME) throw new Error("Use a name of 60 characters or fewer.");
  if (/[\u0000-\u001f\u007f-\u009f]|\p{Cs}/u.test(name)) {
    throw new Error("Use a name without control characters.");
  }
  return name;
}

function watchSize(raw) {
  if (typeof raw !== "string" || encoder.encode(raw).byteLength > MAX_SAVE_LENGTH) {
    throw new Error("A shelf watch must fit in a 32 KB watch file.");
  }
}

function decode(raw) {
  if (raw === null) return [];
  if (typeof raw !== "string" || encoder.encode(raw).byteLength > MAX_SHELF_BYTES) {
    throw new Error("Unsupported shelf size.");
  }
  const value = JSON.parse(raw);
  if (!exactKeys(value, ["version", "entries"]) || value.version !== 1
    || !Array.isArray(value.entries) || value.entries.length > MAX_SHELF_ENTRIES) {
    throw new Error("Unsupported watch shelf.");
  }
  const ids = new Set();
  for (const entry of value.entries) {
    if (!exactKeys(entry, ["id", "name", "watch"]) || typeof entry.id !== "string"
      || !uuid.test(entry.id) || ids.has(entry.id.toLowerCase())
      || nameFor(entry.name) !== entry.name) throw new Error("Invalid shelf entry.");
    watchSize(entry.watch);
    ids.add(entry.id.toLowerCase());
  }
  return value.entries.map(entry => ({ ...entry }));
}

// Inspect through the unchanged native replay boundary. In particular, its
// protected fresh-watch fallback must never become a successful shelf summary.
export function inspectShelfWatch(raw, createSession) {
  watchSize(raw);
  const watch = new SavedWatch({
    createSession,
    getStorage: () => ({
      getItem(key) {
        if (key !== WATCH_SAVE_KEY) throw new Error("Unexpected watch storage key.");
        return raw;
      },
      setItem() { throw new Error("Shelf inspection cannot save a watch."); },
    }),
  });
  try {
    if (watch.status.kind !== "resumed") throw new Error("This watch could not be replayed by this version of Longwater.");
    const state = JSON.parse(watch.snapshot);
    return Object.freeze({
      day: state.day, selected: watch.selected, cell: state.cells[watch.selected].name,
      finished: state.finished, outcome: state.outcome,
    });
  } finally {
    watch.free();
  }
}

export class SavedWatchShelf {
  #getStorage;
  #createSession;
  #createId;
  #raw;
  #entries = [];
  #summaries = [];
  #kind = "unavailable";
  #message = "Open or refresh the shelf to read it.";
  #revision = 0;
  #tokens = new WeakMap();

  constructor({ getStorage, createSession, createId = () => globalThis.crypto.randomUUID() }) {
    this.#getStorage = getStorage;
    this.#createSession = createSession;
    this.#createId = createId;
  }

  get state() {
    return Object.freeze({
      kind: this.#kind,
      message: this.#message,
      ready: this.#kind === "ready",
      count: this.#entries.length,
      bytes: typeof this.#raw === "string" ? encoder.encode(this.#raw).byteLength : 0,
      entries: Object.freeze(this.#summaries.map(entry => Object.freeze({ ...entry }))),
    });
  }

  #summarize() {
    this.#summaries = this.#entries.map(entry => {
      try {
        return { id: entry.id, name: entry.name, valid: true, ...inspectShelfWatch(entry.watch, this.#createSession) };
      } catch {
        return { id: entry.id, name: entry.name, valid: false, problem: "This watch cannot be opened by this version of Longwater. Its stored contents have been kept." };
      }
    });
  }

  refresh() {
    let raw;
    try { raw = this.#getStorage().getItem(WATCH_SHELF_KEY); }
    catch {
      this.#retire("unavailable", "The shelf could not be read. Download your active watch to keep a portable copy, or try Refresh shelf.");
      return this.state;
    }
    if (raw !== this.#raw) this.#revision++;
    this.#raw = raw;
    try {
      this.#entries = decode(raw);
    } catch {
      this.#entries = [];
      this.#summaries = [];
      this.#retire("protected", "The saved shelf is unreadable or from another version. Its contents have been kept; shelf changes are unavailable.");
      return this.state;
    }
    this.#summarize();
    this.#kind = "ready";
    this.#message = this.#entries.length
      ? this.#entries.length + " of 12 watches kept in this browser."
      : "Your shelf is empty. Name and keep a watch to return to it later.";
    return this.state;
  }

  #retire(kind, message) {
    this.#revision++;
    this.#kind = kind;
    this.#message = message;
  }

  storageChanged() {
    this.#retire("changed", "The shelf changed in another tab. Refresh shelf before choosing or changing an entry.");
    return this.state;
  }

  #assertFresh() {
    if (this.#kind !== "ready") throw new Error(this.#message);
    let current;
    try { current = this.#getStorage().getItem(WATCH_SHELF_KEY); }
    catch {
      this.#retire("unavailable", "The shelf could not be read. Refresh shelf before continuing.");
      throw new Error(this.#message);
    }
    if (current !== this.#raw) {
      this.#retire("changed", "The shelf changed. Refresh shelf and review the entry again.");
      throw new Error(this.#message);
    }
  }

  #entry(id) {
    const entry = this.#entries.find(item => item.id === id);
    if (!entry) throw new Error("That shelf entry is no longer available. Refresh shelf.");
    return entry;
  }

  #commit(entries, message) {
    const raw = JSON.stringify({ version: 1, entries });
    if (encoder.encode(raw).byteLength > MAX_SHELF_BYTES) {
      throw new Error("The shelf has reached its 256 KB limit. Remove an entry deliberately or download your active watch.");
    }
    this.#assertFresh();
    try { this.#getStorage().setItem(WATCH_SHELF_KEY, raw); }
    catch {
      this.#retire("unavailable", "The shelf could not be saved. Refresh shelf to check its contents; you can still download your active watch.");
      throw new Error(this.#message);
    }
    let confirmed;
    try { confirmed = this.#getStorage().getItem(WATCH_SHELF_KEY); }
    catch {
      this.#retire("unavailable", "The shelf write could not be confirmed. Refresh shelf to check its contents.");
      throw new Error(this.#message);
    }
    if (confirmed !== raw) {
      this.#retire("changed", "The shelf changed while saving. Refresh shelf to see its current contents.");
      throw new Error(this.#message);
    }
    this.#revision++;
    this.#raw = raw;
    this.#entries = entries;
    this.#summarize();
    this.#kind = "ready";
    this.#message = message;
    return this.state;
  }

  keep(name, raw) {
    this.#assertFresh();
    const normalized = nameFor(name);
    if (this.#entries.length >= MAX_SHELF_ENTRIES) {
      throw new Error("The shelf already holds 12 watches. Remove an entry deliberately or download your active watch.");
    }
    inspectShelfWatch(raw, this.#createSession);
    let id;
    try { id = this.#createId(); }
    catch { throw new Error("A new shelf entry could not be identified. Your watch has not been added; try again or download it."); }
    if (typeof id !== "string" || !uuid.test(id)
      || this.#entries.some(entry => entry.id.toLowerCase() === id.toLowerCase())) {
      throw new Error("A unique shelf entry could not be created. Your watch has not been added; try again.");
    }
    this.#commit([...this.#entries, { id, name: normalized, watch: raw }], "Kept “" + normalized + "” on your shelf. Your active watch is unchanged.");
    return id;
  }

  rename(id, name) {
    this.#assertFresh();
    const entry = this.#entry(id);
    const normalized = nameFor(name);
    if (entry.name === normalized) {
      this.#message = "The name is unchanged.";
      return this.state;
    }
    return this.#commit(this.#entries.map(item => item.id === id ? { ...item, name: normalized } : item),
      "Renamed this shelf entry. Its watch and your active watch are unchanged.");
  }

  #review(id, purpose) {
    this.#assertFresh();
    const entry = this.#entry(id);
    if (purpose === "open") inspectShelfWatch(entry.watch, this.#createSession);
    const token = Object.freeze({ id: entry.id, name: entry.name, watch: entry.watch });
    this.#tokens.set(token, { revision: this.#revision, raw: this.#raw, purpose });
    return token;
  }

  reviewOpen(id) { return this.#review(id, "open"); }
  reviewRemove(id) { return this.#review(id, "remove"); }

  isCurrent(token) {
    const record = token && this.#tokens.get(token);
    if (!record || record.revision !== this.#revision || record.raw !== this.#raw) return false;
    try { this.#assertFresh(); }
    catch { return false; }
    return this.#entries.some(entry => entry.id === token.id && entry.watch === token.watch && entry.name === token.name);
  }

  cancelReview(token) {
    if (token && typeof token === "object") this.#tokens.delete(token);
  }

  remove(token) {
    if (this.#tokens.get(token)?.purpose !== "remove" || !this.isCurrent(token)) {
      throw new Error("This removal review is no longer current. Refresh shelf and choose the entry again.");
    }
    this.#tokens.delete(token);
    return this.#commit(this.#entries.filter(entry => entry.id !== token.id),
      "Removed “" + token.name + "” from the shelf. Your active watch is unchanged.");
  }
}
