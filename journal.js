import { WatchTrends } from "./watch-trends.js";

const actionNames = { gate: "Gate", shade: "Shade", seed: "Seed" };
const readings = [
  ["Depth", "depth", "cm"],
  ["Salt", "salinity", "ppt"],
  ["Oxygen", "oxygen", "%"],
  ["Life", "biomass", "%"],
  ["Canopy", "shade", "/ 3"],
];

function element(tag, text = "", className = "") {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

function resourceChanges(before, after) {
  return element("p", `Freshwater: ${before.freshwater} → ${after.freshwater}. Seed packs: ${before.seedPacks} → ${after.seedPacks}.`, "journal-resources");
}

function cellChanges(before, after) {
  const grid = element("div", "", "journal-cells");
  for (const cell of after.cells) {
    const previous = before.cells.find(item => item.id === cell.id);
    const card = element("section", "", "journal-cell");
    card.dataset.cellId = cell.id;
    card.append(element("h4", cell.name));
    const list = element("dl");
    for (const [name, key, unit] of readings) {
      const row = element("div");
      row.append(element("dt", name), element("dd", `${previous[key]} → ${cell[key]} ${unit}`));
      list.append(row);
    }
    card.append(list);
    grid.append(card);
  }
  return grid;
}

/** Presents the actual completed WASM turns; it never runs or changes a turn. */
export class WatchJournal {
  constructor(root) {
    this.root = root;
    const title = element("h2", "Watch journal");
    title.id = "journal-title";
    this.details = element("details");
    this.details.id = "journal-details";
    const toggle = element("summary", "", "journal-toggle");
    toggle.append(element("span", "Review this watch"));
    this.count = element("span", "No tides yet", "journal-count");
    this.count.id = "journal-count";
    toggle.append(this.count);
    this.recap = element("section", "", "journal-recap");
    this.recap.id = "watch-recap";
    this.recap.setAttribute("aria-label", "Completed watch review");
    this.recap.hidden = true;
    this.empty = element("p", "Your first tide will appear here after you choose an action.", "journal-empty");
    this.lifetime = element("p", "This journal stays in this tab until you reset the watch or reload the page.", "journal-lifetime");
    this.entries = element("ol", "", "journal-entries");
    this.entries.id = "journal-entries";
    const trendsRoot = element("section");
    this.trends = new WatchTrends(trendsRoot);
    this.details.append(
      toggle,
      element("p", "Revisit each choice, the complete field notes and every cell’s readings before and after the tide. Net changes include your action, the tide and dawn drift.", "journal-intro"),
      this.lifetime,
      this.recap,
      this.empty,
      trendsRoot,
      this.entries,
    );
    root.append(title, this.details);
  }

  // A receiving save integration can describe its actual persistence behavior.
  setLifetime(message) {
    this.lifetime.textContent = message;
  }

  start(state) {
    if (state.day !== 0) throw new Error("Start the journal at day zero, or restore the complete native replay.");
    this.initial = structuredClone(state);
    this.entries.replaceChildren();
    this.recap.replaceChildren();
    this.recap.hidden = true;
    this.empty.hidden = false;
    this.count.textContent = "No tides yet";
    this.root.hidden = false;
    this.trends.start(state);
  }

  /**
   * The caller supplies native snapshot_json()/take_turn() strings from an
   * accepted replay, starting at day zero. Saved measurements alone are not a
   * replay. This checks sequence order, not the provenance of those strings.
   */
  restore(snapshots) {
    if (!Array.isArray(snapshots) || snapshots.length < 1 || snapshots.length > 15) {
      throw new Error("A journal replay must contain the opening snapshot and at most fourteen tides.");
    }
    const states = snapshots.map(snapshot => JSON.parse(snapshot));
    if (states.some((state, index) => state.day !== index || (index > 0 && state.report?.day !== index))) {
      throw new Error("A journal replay must contain every completed tide in order.");
    }
    // Reject incomplete/out-of-order histories before replacing the current UI.
    this.start(states[0]);
    for (let index = 1; index < states.length; index++) this.record(states[index - 1], states[index]);
  }

  record(before, after) {
    if (before.day !== this.entries.children.length || after.day !== before.day + 1 || after.day > 14 || after.report?.day !== after.day) {
      throw new Error("Only the next completed native tide can be added to this journal.");
    }
    // The report identifies the action and cell actually accepted by the sim.
    const report = after.report;
    const cell = after.cells.find(item => item.id === report.cell);
    const entry = element("li");
    entry.dataset.tide = String(report.day);
    const details = element("details", "", "journal-tide");
    const toggle = element("summary");
    toggle.append(
      element("span", `Tide ${report.day} · ${actionNames[report.action]} · ${cell.name}`, "journal-choice"),
      element("span", report.event.name, "journal-event"),
    );
    const body = element("div", "", "journal-tide-body");
    const notes = element("ul", "", "journal-notes");
    for (const line of report.lines) notes.append(element("li", line));
    body.append(
      element("p", report.event.note, "journal-event-note"),
      element("h3", "Full field notes"),
      notes,
      element("h3", "Before → after this tide"),
      resourceChanges(before, after),
      cellChanges(before, after),
    );
    details.append(toggle, body);
    entry.append(details);
    this.entries.append(entry);
    this.empty.hidden = true;
    this.count.textContent = `${this.entries.children.length} of 14 tides${after.finished ? " · Watch closed" : ""}`;
    if (after.finished) {
      this.recap.append(
        element("h3", `Watch closed · ${after.outcome}`),
        element("p", "Opening readings → final readings across the whole watch. Expand any tide below to trace what happened.", "journal-intro"),
        resourceChanges(this.initial, after),
        cellChanges(this.initial, after),
      );
      this.recap.hidden = false;
      this.details.open = true;
    }
    this.trends.record(before, after);
  }
}
