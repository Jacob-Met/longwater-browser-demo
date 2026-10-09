import { readFileSync } from "node:fs";
import { initSync, BrowserSession } from "../pkg/longwater_web.js";

const COMMANDS = "state; select north; select heart; select south; gate; shade; seed; journal; restart; keep; confirm; help; quit";
const INVALID = "Use an exact listed command.";
let initialized = false;

function initialize() {
  if (!initialized) {
    initSync({ module: readFileSync(new URL("../pkg/longwater_web_bg.wasm", import.meta.url)) });
    initialized = true;
  }
}

function nativeMessage(error) {
  return String(error?.message || error);
}

export async function openTerminalWatch() {
  if (arguments.length !== 0) throw new TypeError("Open a terminal watch without arguments.");
  initialize();
  const session = new BrowserSession();
  let native;
  try {
    native = session.snapshot_json();
  } catch (error) {
    session.free();
    throw error;
  }
  let opening = native;
  let selected = "heart";
  let journal = [];
  let restartPending = false;
  let closed = false;

  function reply(kind = "state", message = null) {
    return { kind, selected, restartPending, closed, opening, native,
      journal: journal.slice(), message };
  }

  function close() {
    if (closed) return;
    closed = true;
    restartPending = false;
    session.free();
  }

  function command(text) {
    if (closed) throw new Error("This terminal watch is closed.");
    if (typeof text !== "string" || /[^\x00-\x7f\r\n]/.test(text)) {
      return reply("refusal", INVALID);
    }
    if (text.length > 128) return reply("refusal", "Command exceeds 128 bytes.");
    const selection = /^(select (north|heart|south))$/.exec(text);
    const action = text === "gate" || text === "shade" || text === "seed";
    const known = selection || action ||
      ["state", "journal", "restart", "keep", "confirm", "help", "quit"].includes(text);
    if (!known) return reply("refusal", INVALID);

    if (text === "state") return reply();
    if (text === "journal") return reply("state", "Recorded tides: " + journal.length);
    if (text === "help") return reply("help", "Commands: " + COMMANDS + ".");
    if (text === "quit") {
      close();
      return reply("closed");
    }
    if (text === "restart") {
      if (restartPending) return reply("refusal", "A restart review is already open.");
      restartPending = true;
      return reply("review", "Start a new watch? Use confirm or keep.");
    }
    if (text === "keep" || text === "confirm") {
      if (!restartPending) return reply("refusal", "No restart review is open.");
      if (text === "keep") {
        restartPending = false;
        return reply("state", "Kept this watch.");
      }
      try {
        const restarted = session.restart();
        native = restarted;
        opening = restarted;
        journal = [];
        selected = "heart";
        restartPending = false;
        return reply("state", "Started a new watch.");
      } catch (error) {
        return reply("refusal", nativeMessage(error));
      }
    }
    if (restartPending) return reply("refusal", "Choose confirm or keep before playing.");
    if (selection) {
      selected = selection[2];
      return reply();
    }
    try {
      const next = session.take_turn(text, selected);
      native = next;
      journal.push(next);
      return reply();
    } catch (error) {
      return reply("refusal", nativeMessage(error));
    }
  }

  return Object.freeze({ command, close });
}

function renderSnapshot(raw, title) {
  const snapshot = JSON.parse(raw);
  const lines = [
    title,
    "Tide " + snapshot.day + " / 14",
    "Freshwater: " + snapshot.freshwater + "; Seed packs: " + snapshot.seedPacks
  ];
  for (const cell of snapshot.cells) {
    lines.push(cell.name + " [" + cell.id + "] — " + cell.zone + "; " + cell.material);
    lines.push("  Depth " + cell.depth + " cm; Salt " + cell.salinity +
      " ppt; Oxygen " + cell.oxygen + "%; Life " + cell.biomass +
      "%; Canopy " + cell.shade + " / 3");
  }
  lines.push("Finished: " + snapshot.finished);
  if (snapshot.report !== null) {
    lines.push("Full tide report:");
    for (const note of snapshot.report.lines) lines.push(note);
    lines.push(JSON.stringify(snapshot.report, null, 2));
  }
  if (snapshot.outcome !== null) {
    lines.push("Outcome:", JSON.stringify(snapshot.outcome, null, 2));
  }
  return lines.join("\n");
}

export function formatTerminalReply(admittedReply) {
  const lines = [
    "Longwater · temporary local watch",
    "Selected: " + admittedReply.selected,
    renderSnapshot(admittedReply.native, "Current watch")
  ];
  if (admittedReply.message !== null) lines.push(admittedReply.message);
  if (admittedReply.restartPending) lines.push("Restart review is open.");
  if (admittedReply.closed) lines.push("Watch closed.");
  if (admittedReply.kind === "state" &&
      admittedReply.message === "Recorded tides: " + admittedReply.journal.length) {
    lines.push(renderSnapshot(admittedReply.opening, "Watch opening"));
    for (let i = 0; i < admittedReply.journal.length; i++) {
      lines.push(renderSnapshot(admittedReply.journal[i], "Recorded tide " + (i + 1)));
    }
  }
  return lines.join("\n") + "\n";
}
