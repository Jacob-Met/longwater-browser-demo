export const CHOICE_ACTIONS = Object.freeze(["gate", "shade", "seed"]);
export const CHOICE_CELLS = Object.freeze(["north", "heart", "south"]);
const MAX_TIDES = 14;
const MAX_SNAPSHOT_LENGTH = 32768;

function historyStates(snapshots) {
  if (!Array.isArray(snapshots) || snapshots.length < 2 || snapshots.length > MAX_TIDES + 1
    || snapshots.some(snapshot => typeof snapshot !== "string" || snapshot.length > MAX_SNAPSHOT_LENGTH)) {
    throw new Error("Choose a watch with one to fourteen completed tides.");
  }
  let states;
  try { states = snapshots.map(snapshot => JSON.parse(snapshot)); }
  catch { throw new Error("The completed watch history could not be read."); }
  if (states.some((state, index) => !state || typeof state !== "object" || Array.isArray(state)
    || state.day !== index || (index > 0 && (state.report?.day !== index
      || !CHOICE_ACTIONS.includes(state.report.action) || !CHOICE_CELLS.includes(state.report.cell))))) {
    throw new Error("The watch history must contain the opening and every completed tide in order.");
  }
  return states;
}

function freeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * Compare exactly one already completed tide in fresh, owned native sessions.
 * The factory must create a new BrowserSession; no live session or storage is accepted.
 * All supplied snapshots are checked against the shipped engine before branching.
 */
export function compareHistoricalTide(snapshots, tide, action, cell, createSession) {
  const captured = Array.isArray(snapshots) ? snapshots.slice() : snapshots;
  const states = historyStates(captured);
  if (!Number.isInteger(tide) || tide < 1 || tide >= captured.length) {
    throw new Error("Choose an already completed tide from this watch.");
  }
  if (!CHOICE_ACTIONS.includes(action) || !CHOICE_CELLS.includes(cell)) {
    throw new Error("Choose Gate, Shade or Seed and one of the three marsh cells.");
  }
  if (typeof createSession !== "function") throw new Error("The native simulation is unavailable.");

  const verification = createSession();
  try {
    if (verification.snapshot_json() !== captured[0]) throw new Error("The watch opening does not match this simulation.");
    for (let index = 1; index < captured.length; index++) {
      const report = states[index].report;
      const actual = verification.take_turn(report.action, report.cell);
      if (actual !== captured[index] || verification.snapshot_json() !== actual) {
        throw new Error("Completed tide " + index + " does not match its native replay.");
      }
    }
  } finally {
    verification.free();
  }

  const alternative = createSession();
  try {
    if (alternative.snapshot_json() !== captured[0]) throw new Error("The alternative session has a different opening.");
    for (let index = 1; index < tide; index++) {
      const report = states[index].report;
      if (alternative.take_turn(report.action, report.cell) !== captured[index]) {
        throw new Error("The historical prefix does not match its native replay.");
      }
    }
    const actual = alternative.take_turn(action, cell);
    const result = JSON.parse(actual);
    if (result.day !== tide || result.report?.day !== tide || alternative.snapshot_json() !== actual) {
      throw new Error("The alternative did not produce exactly one native tide.");
    }
    return freeze({
      tide,
      action,
      cell,
      before: states[tide - 1],
      played: states[tide],
      alternative: result,
      matchesPlayed: actual === captured[tide],
    });
  } finally {
    alternative.free();
  }
}
