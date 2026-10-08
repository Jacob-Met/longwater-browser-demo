import { CHOICE_ACTIONS, CHOICE_CELLS, compareHistoricalTide } from "./watch-choice-model.js";

const ACTION_NAMES = { gate: "Gate", shade: "Shade", seed: "Seed" };
const READINGS = [
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

function labeledSelect(id, label) {
  const wrapper = element("label", label);
  const control = element("select");
  control.id = id;
  wrapper.htmlFor = id;
  wrapper.append(control);
  return { wrapper, control };
}

function sameHistory(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

/** An optional reader of completed native history; it owns no live watch or save. */
export class WatchChoice {
  #readHistory;
  #createSession;
  #history = [];
  #stateToken;
  #version = 0;

  constructor(root, { readHistory, createSession }) {
    this.root = root;
    this.#readHistory = readHistory;
    this.#createSession = createSession;
    root.hidden = true;
    const heading = element("h2", "Try a different choice");
    heading.id = "choice-title";
    this.details = element("details");
    this.details.id = "choice-details";
    const toggle = element("summary", "Explore one completed tide", "choice-toggle");
    const intro = element("p", "Choose a tide you have already played, then try another action or cell. A separate copy of the native simulation replays that one tide. Your current watch and saved progress stay in place.", "choice-intro");
    this.form = element("form");
    this.form.id = "choice-form";
    const controls = element("div", "", "choice-controls");
    const tide = labeledSelect("choice-tide", "Completed tide");
    const cell = labeledSelect("choice-cell", "Try on this cell");
    const action = labeledSelect("choice-action", "Try this action");
    this.tide = tide.control;
    this.cell = cell.control;
    this.action = action.control;
    controls.append(tide.wrapper, cell.wrapper, action.wrapper);
    for (const name of CHOICE_ACTIONS) {
      const option = element("option", ACTION_NAMES[name]);
      option.value = name;
      this.action.append(option);
    }
    this.run = element("button", "Compare this choice", "choice-compare");
    this.run.id = "choice-run";
    this.run.type = "submit";
    this.form.append(controls, this.run);
    this.status = element("p", "", "choice-status");
    this.status.id = "choice-status";
    this.status.setAttribute("role", "status");
    this.status.setAttribute("aria-live", "polite");
    this.result = element("section", "", "choice-result");
    this.result.id = "choice-result";
    this.result.hidden = true;
    this.result.setAttribute("aria-label", "Historical choice comparison");
    const limit = element("p", "This compares one complete tide, including its event and dawn drift. It does not replay the later watch or recommend a strategy.", "choice-limit");
    this.details.append(toggle, intro, this.form, this.status, this.result, limit);
    root.append(heading, this.details);

    this.tide.addEventListener("change", () => {
      this.#chooseRecorded();
      this.#clearResult("Choose an action and cell, then compare this completed tide.");
    });
    for (const control of [this.cell, this.action]) {
      control.addEventListener("change", () => this.#clearResult("Choice changed. Compare again to see its native result."));
    }
    this.form.addEventListener("submit", event => {
      event.preventDefault();
      this.#compare();
    });
  }

  // Every accepted state replacement gets a new token from the game's render path.
  // Cell selection, resize, dialog cancellation and comparison itself keep that token.
  synchronize(stateToken) {
    if (!stateToken) {
      // A replaced watch can be unavailable to the display. Retire its old
      // comparison without reading history or allocating a native session.
      this.#stateToken = undefined;
      this.#history.length = 0;
      this.#clearResult("");
      this.tide.replaceChildren();
      this.cell.replaceChildren();
      this.details.open = false;
      this.form.hidden = true;
      this.root.hidden = true;
      return;
    }
    if (stateToken === this.#stateToken) return;
    this.#stateToken = stateToken;
    try { this.#load(this.#readHistory()); }
    catch {
      this.#history = [];
      this.#clearResult("Completed history is unavailable for comparison. The live game is unchanged.");
      this.root.hidden = false;
      this.form.hidden = true;
    }
  }

  #clearResult(message) {
    this.#version++;
    this.result.replaceChildren();
    this.result.hidden = true;
    delete this.result.dataset.tide;
    this.status.textContent = message;
  }

  #load(history) {
    if (!Array.isArray(history) || history.length < 1 || history.length > 15
      || history.some(snapshot => typeof snapshot !== "string")) {
      throw new Error("Incomplete native history.");
    }
    const states = history.map(snapshot => JSON.parse(snapshot));
    if (states.some((state, index) => state?.day !== index
      || (index > 0 && (state.report?.day !== index
        || !CHOICE_ACTIONS.includes(state.report.action) || !CHOICE_CELLS.includes(state.report.cell))))) {
      throw new Error("Incomplete native history.");
    }
    this.#history = history.slice();
    this.#clearResult(states.length > 1
      ? "Choose a completed tide. Its recorded action is selected for comparison."
      : "Complete a tide before trying a different historical choice.");
    this.root.hidden = states.length === 1;
    this.form.hidden = states.length === 1;
    this.tide.replaceChildren();
    for (let index = 1; index < states.length; index++) {
      const report = states[index].report;
      const option = element("option", "Tide " + index + " · " + ACTION_NAMES[report.action]);
      option.value = String(index);
      this.tide.append(option);
    }
    if (states.length === 1) {
      this.details.open = false;
      return;
    }
    this.tide.value = String(states.length - 1);
    this.#chooseRecorded();
  }

  #chooseRecorded() {
    const tide = Number(this.tide.value);
    const recorded = JSON.parse(this.#history[tide]);
    this.cell.replaceChildren();
    for (const cell of recorded.cells) {
      const option = element("option", cell.name);
      option.value = cell.id;
      this.cell.append(option);
    }
    this.cell.value = recorded.report.cell;
    this.action.value = recorded.report.action;
  }

  #compare() {
    if (this.#history.length < 2) return;
    const captured = this.#history.slice();
    const tide = Number(this.tide.value);
    const action = this.action.value;
    const cell = this.cell.value;
    this.#clearResult("Replaying this completed tide in a separate simulation…");
    const version = this.#version;
    try {
      const current = this.#readHistory();
      if (!sameHistory(current, captured)) {
        this.#load(current);
        this.status.textContent = "The active watch changed. Choose one of its completed tides before comparing.";
        return;
      }
      const compared = compareHistoricalTide(captured, tide, action, cell, this.#createSession);
      const after = this.#readHistory();
      if (version !== this.#version) return;
      if (!sameHistory(after, captured)) {
        this.#load(after);
        this.status.textContent = "The active watch changed during comparison. No old result was kept.";
        return;
      }
      this.#show(compared);
      this.status.textContent = compared.matchesPlayed
        ? "This replay exactly matches the recorded choice. Your live watch is unchanged."
        : "Historical comparison ready. Your live watch, selected cell and saved progress are unchanged.";
    } catch (error) {
      if (version !== this.#version) return;
      this.#clearResult("This choice could not be compared: " + String(error).replace(/^Error:\s*/, "") + " Your live watch is unchanged.");
    }
  }

  #show(compared) {
    const { before, played, alternative } = compared;
    const originalCell = played.cells.find(cell => cell.id === played.report.cell);
    const chosenCell = alternative.cells.find(cell => cell.id === compared.cell);
    const title = element("h3", "Tide " + compared.tide + " · Played and alternative", "choice-result-title");
    title.tabIndex = -1;
    this.result.dataset.tide = String(compared.tide);
    this.result.append(
      title,
      element("p", "Played: " + ACTION_NAMES[played.report.action] + " · " + originalCell.name, "choice-played-label"),
      element("p", "Alternative: " + ACTION_NAMES[compared.action] + " · " + chosenCell.name, "choice-alternative-label"),
    );
    const resources = element("table", "", "choice-resources");
    resources.append(element("caption", "Resources at this tide"));
    const resourceHead = element("tr");
    for (const label of ["Resource", "Before tide", "Played", "Alternative"]) {
      const th = element("th", label); th.scope = "col"; resourceHead.append(th);
    }
    const thead = element("thead"); thead.append(resourceHead); resources.append(thead);
    const resourceBody = element("tbody");
    for (const [name, key] of [["Freshwater", "freshwater"], ["Seed packs", "seedPacks"]]) {
      const row = element("tr"); row.dataset.resource = key;
      const label = element("th", name); label.scope = "row"; row.append(label);
      for (const state of [before, played, alternative]) row.append(element("td", String(state[key])));
      resourceBody.append(row);
    }
    resources.append(resourceBody);
    this.result.append(resources);

    const cells = element("div", "", "choice-cells");
    for (const cell of before.cells) {
      const actual = played.cells.find(item => item.id === cell.id);
      const other = alternative.cells.find(item => item.id === cell.id);
      const card = element("section", "", "choice-cell");
      card.dataset.cellId = cell.id;
      card.append(element("h4", cell.name));
      const table = element("table");
      table.append(element("caption", cell.name + " · exact native readings", "visually-hidden"));
      const head = element("thead");
      const headings = element("tr");
      for (const label of ["Reading", "Before", "Played", "Alternative"]) {
        const th = element("th", label); th.scope = "col"; headings.append(th);
      }
      head.append(headings);
      const body = element("tbody");
      for (const [name, key, unit] of READINGS) {
        const row = element("tr"); row.dataset.reading = key;
        const label = element("th", name + " (" + unit + ")"); label.scope = "row"; row.append(label);
        for (const state of [cell, actual, other]) row.append(element("td", String(state[key])));
        body.append(row);
      }
      table.append(head, body); card.append(table); cells.append(card);
    }
    this.result.append(cells);

    const reports = element("div", "", "choice-reports");
    for (const [kind, heading, state] of [["played", "Played tide", played], ["alternative", "Alternative tide", alternative]]) {
      const section = element("section", "", "choice-report");
      section.dataset.kind = kind;
      section.append(
        element("h4", heading),
        element("p", state.report.event.name, "choice-event"),
        element("p", state.report.event.note, "choice-event-note"),
      );
      const lines = element("ul", "", "choice-notes");
      for (const line of state.report.lines) lines.append(element("li", line));
      section.append(lines);
      if (state.finished) section.append(element("p", "Watch outcome at this tide: " + state.outcome, "choice-outcome"));
      reports.append(section);
    }
    this.result.append(reports);
    this.result.hidden = false;
    title.focus();
  }
}
