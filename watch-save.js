// A save is a bounded input history, replayed by the shipped simulation. Stored
// cell measurements are never loaded into WASM as authority.
export const WATCH_SAVE_KEY = "longwater.watch.v1";
export const SIMULATION_REVISION = "76deec059601613d588f4685444d407da81b3339f7cf7bdaf1bd1a13b285dae2";
export const MAX_SAVE_LENGTH = 32768;
const MAX_TURNS = 14;
const ACTIONS = new Set(["gate", "shade", "seed"]);
const CELLS = ["north", "heart", "south"];

function exactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every(key => Object.hasOwn(value, key));
}

function decode(raw) {
  if (typeof raw !== "string" || raw.length > MAX_SAVE_LENGTH) throw new Error("Invalid save size.");
  const value = JSON.parse(raw);
  if (!exactKeys(value, ["version", "simulation", "turns", "selected", "snapshot"])
    || value.version !== 1 || value.simulation !== SIMULATION_REVISION
    || !Array.isArray(value.turns) || value.turns.length > MAX_TURNS
    || !CELLS.includes(value.selected) || typeof value.snapshot !== "string") {
    throw new Error("Unsupported watch save.");
  }
  for (const turn of value.turns) {
    if (!exactKeys(turn, ["action", "cell"]) || !ACTIONS.has(turn.action) || !CELLS.includes(turn.cell)) {
      throw new Error("Invalid saved action.");
    }
  }
  return value;
}

function replay(value, createSession) {
  const candidate = createSession();
  try {
    let snapshot = candidate.snapshot_json();
    if (JSON.parse(snapshot).day !== 0) throw new Error("Expected a fresh watch.");
    for (const [index, turn] of value.turns.entries()) {
      snapshot = candidate.take_turn(turn.action, turn.cell);
      if (JSON.parse(snapshot).day !== index + 1) throw new Error("Saved action did not advance one tide.");
    }
    if (snapshot !== value.snapshot || candidate.snapshot_json() !== snapshot) {
      throw new Error("Saved watch does not match its simulation replay.");
    }
    return candidate;
  } catch (error) {
    candidate.free();
    throw error;
  }
}

export class SavedWatch {
  #createSession;
  #getStorage;
  #session;
  #turns = [];
  #selected = 1;
  #expected;
  #readKnown = false;
  #blocked = false;
  #status;

  constructor({ createSession, getStorage }) {
    this.#createSession = createSession;
    this.#getStorage = getStorage;
    this.#session = createSession();
    let raw;
    try {
      raw = getStorage().getItem(WATCH_SAVE_KEY);
      this.#expected = raw;
      this.#readKnown = true;
    } catch {
      this.#unavailable();
      return;
    }
    if (raw === null) {
      this.#status = { kind: "ready", message: "Your watch will save in this browser after each tide.", canRetry: false };
      return;
    }
    try {
      const saved = decode(raw);
      const resumed = replay(saved, this.#createSession);
      this.#session.free();
      this.#session = resumed;
      this.#turns = saved.turns;
      this.#selected = CELLS.indexOf(saved.selected);
      this.#status = { kind: "resumed", message: `Resumed your saved watch at day ${this.#turns.length} of 14.`, canRetry: false };
    } catch {
      this.#blocked = true;
      this.#status = {
        kind: "protected",
        message: "The saved watch could not be resumed and has been kept. You can play without saving, or Reset to replace it with a new watch.",
        canRetry: false,
      };
    }
  }

  get snapshot() { return this.#session.snapshot_json(); }
  get selected() { return this.#selected; }
  get status() { return { ...this.#status }; }

  #unavailable() {
    this.#status = {
      kind: "unavailable",
      message: "This watch could not be saved. Keep this page open and try saving again; reloading may return to an earlier watch.",
      canRetry: true,
    };
  }

  #changed() {
    this.#blocked = true;
    this.#status = {
      kind: "changed",
      message: "The saved watch changed in another tab. Reload to resume it. This page can play without saving, or Reset to replace the saved watch.",
      canRetry: false,
    };
  }

  save() {
    if (this.#blocked) return false;
    try {
      const storage = this.#getStorage();
      const current = storage.getItem(WATCH_SAVE_KEY);
      // A previously unreadable store may already contain another watch. Only
      // an explicit Reset may choose to replace that previously unknown data.
      if ((!this.#readKnown && current !== null) || (this.#readKnown && current !== this.#expected)) {
        this.#changed();
        return false;
      }
      this.#expected = current;
      this.#readKnown = true;
      const raw = JSON.stringify({
        version: 1,
        simulation: SIMULATION_REVISION,
        turns: this.#turns,
        selected: CELLS[this.#selected],
        snapshot: this.snapshot,
      });
      if (raw.length > MAX_SAVE_LENGTH) throw new Error("Watch is too large to save.");
      storage.setItem(WATCH_SAVE_KEY, raw);
      this.#expected = raw;
      this.#status = { kind: "saved", message: `Day ${this.#turns.length} of 14 saved in this browser.`, canRetry: false };
      return true;
    } catch {
      this.#unavailable();
      return false;
    }
  }

  select(index) {
    if (!Number.isInteger(index) || index < 0 || index >= CELLS.length) throw new Error("Unknown marsh cell.");
    if (index === this.#selected) return;
    this.#selected = index;
    this.save();
  }

  takeTurn(action) {
    if (!ACTIONS.has(action)) throw new Error("Unknown marsh action.");
    const cell = CELLS[this.#selected];
    // The native method throws before accepting unavailable actions. Record
    // only a successful call, so retrying a refused action never gains a tide.
    const snapshot = this.#session.take_turn(action, cell);
    this.#turns.push({ action, cell });
    this.save();
    return snapshot;
  }

  reset() {
    const snapshot = this.#session.restart();
    this.#turns = [];
    this.#selected = 1;
    this.#blocked = false;
    try {
      // Reset is the user's explicit choice to replace the stored watch,
      // including an unsupported save or an observed change from another tab.
      this.#expected = this.#getStorage().getItem(WATCH_SAVE_KEY);
      this.#readKnown = true;
    } catch {
      this.#unavailable();
      return snapshot;
    }
    this.save();
    return snapshot;
  }

  storageChanged() {
    if (this.#blocked) return;
    try {
      const current = this.#getStorage().getItem(WATCH_SAVE_KEY);
      if ((!this.#readKnown && current !== null) || (this.#readKnown && current !== this.#expected)) this.#changed();
    } catch {
      this.#unavailable();
    }
  }

  free() { this.#session.free(); }
}
