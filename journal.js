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
    this.entries = element("ol", "", "journal-entries");
    this.entries.id = "journal-entries";
    this.details.append(
      toggle,
      element("p", "Revisit each choice, the complete field notes and every cell’s readings before and after the tide. Net changes include your action, the tide and dawn drift.", "journal-intro"),
      element("p", "This journal stays in this tab until you reset the watch or reload the page.", "journal-lifetime"),
      this.recap,
      this.empty,
      this.entries,
    );
    root.append(title, this.details);
  }

  start(state) {
    this.initial = structuredClone(state);
    this.entries.replaceChildren();
    this.recap.replaceChildren();
    this.recap.hidden = true;
    this.empty.hidden = false;
    this.count.textContent = "No tides yet";
    this.root.hidden = false;
  }

  record(before, after) {
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
  }
}
