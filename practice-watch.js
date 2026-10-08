// A practice watch owns only a fresh simulation and the elements in its dialog.
// The caller supplies the already initialized, unchanged BrowserSession class.
const ACTIONS = {
  gate: { name: "Gate", note: "Spend 1 water" },
  shade: { name: "Shade", note: "Add canopy, up to 3" },
  seed: { name: "Seed", note: "Spend 1 seed pack" },
};
const READINGS = [
  ["depth", "Depth (cm)"], ["salinity", "Salt (ppt)"],
  ["oxygen", "Oxygen (%)"], ["biomass", "Life (%)"], ["shade", "Canopy (of 3)"],
];

export class PracticeWatch {
  #dialog;
  #trigger;
  #createSession;
  #session = null;
  #state = null;
  #before = null;
  #selected = 1;

  constructor(dialog, trigger, createSession) {
    this.#dialog = dialog;
    this.#trigger = trigger;
    this.#createSession = createSession;
    trigger.addEventListener("click", () => this.#open());
    dialog.querySelector("[data-practice-close]").addEventListener("click", () => this.#close());
    dialog.querySelector("[data-practice-restart]").addEventListener("click", () => {
      if (!this.#session || !dialog.open) return;
      try {
        this.#fresh();
        this.#notice("Practice restarted at tide 0. Choose a cell and try one action.");
      } catch (error) { this.#notice("Practice could not restart: " + this.#error(error)); }
    });
    dialog.querySelectorAll("[data-practice-cell]").forEach(button => {
      button.addEventListener("click", () => {
        if (!this.#session) return;
        this.#selected = Number(button.dataset.practiceCell);
        this.#controls();
        this.#notice(this.#state.cells[this.#selected].name + " selected for practice. No tide advanced.");
      });
    });
    dialog.querySelectorAll("[data-practice-action]").forEach(button => {
      button.addEventListener("click", () => this.#turn(button.dataset.practiceAction));
    });
    dialog.addEventListener("cancel", event => {
      event.preventDefault();
      this.#close();
    });
    // close events are queued. A previous close must not free a newly opened watch.
    dialog.addEventListener("close", () => {
      if (!dialog.open) this.#release();
    });
    dialog.ownerDocument.defaultView.addEventListener("pagehide", () => this.#close(false));
    trigger.disabled = false;
  }

  #error(error) { return String(error).replace(/^Error:\s*/, ""); }
  #notice(text) { this.#dialog.querySelector("#practice-status").textContent = text; }

  #release() {
    const session = this.#session;
    this.#session = null;
    this.#state = null;
    this.#before = null;
    session?.free();
  }

  #fresh() {
    const candidate = this.#createSession();
    let state;
    try { state = JSON.parse(candidate.snapshot_json()); }
    catch (error) { candidate.free(); throw error; }
    const old = this.#session;
    this.#session = candidate;
    this.#state = state;
    this.#before = null;
    this.#selected = 1;
    old?.free();
    this.#render();
  }

  #open() {
    if (this.#dialog.open) return;
    const entryStatus = this.#trigger.ownerDocument.querySelector("#practice-entry-status");
    entryStatus.textContent = "";
    try {
      this.#fresh();
      this.#dialog.showModal();
      this.#notice("Fresh practice watch. Select a cell, then try Gate, Shade, or Seed.");
      this.#dialog.querySelector('[data-practice-cell="1"]').focus();
    } catch (error) {
      this.#release();
      if (this.#dialog.open) this.#dialog.close();
      entryStatus.textContent = "Practice could not open: " + this.#error(error) + ". Your active watch is unchanged.";
      this.#trigger.focus();
    }
  }

  #close(restoreFocus = true) {
    const wasOpen = this.#dialog.open;
    this.#release();
    if (wasOpen) this.#dialog.close();
    if (wasOpen && restoreFocus) this.#trigger.focus();
  }

  #turn(action) {
    if (!this.#session || !this.#dialog.open || !Object.hasOwn(ACTIONS, action)) return;
    const before = this.#state;
    try {
      // Availability is decided by the real simulation, including rejected turns.
      const result = this.#session.take_turn(action, before.cells[this.#selected].id);
      this.#state = JSON.parse(result);
      this.#before = before;
      this.#render();
      this.#notice("Practice tide " + this.#state.day + " of 14 complete. " +
        ACTIONS[action].name + " at " + before.cells[this.#selected].name +
        ". Read the whole-tide result below." +
        (this.#state.finished ? " Practice watch closed: " + this.#state.outcome + "." : ""));
    } catch (error) {
      this.#notice("Practice action refused: " + this.#error(error));
    }
  }

  #controls() {
    const state = this.#state;
    const cell = state.cells[this.#selected];
    this.#dialog.querySelector("#practice-summary").textContent =
      "Practice tide " + state.day + " / 14 · Water " + state.freshwater + " · Seed packs " + state.seedPacks +
      (state.finished ? " · " + state.outcome : "");
    this.#dialog.querySelectorAll("[data-practice-cell]").forEach((button, index) => {
      button.textContent = state.cells[index].name;
      button.setAttribute("aria-pressed", String(index === this.#selected));
    });
    this.#dialog.querySelectorAll("[data-practice-action]").forEach(button => {
      const action = button.dataset.practiceAction;
      const unavailable = state.finished || (action === "gate" && state.freshwater < 1) ||
        (action === "seed" && state.seedPacks < 1) || (action === "shade" && cell.shade >= 3);
      button.setAttribute("aria-disabled", String(unavailable));
      button.setAttribute("aria-label", ACTIONS[action].name + " in practice. " + ACTIONS[action].note +
        " at " + cell.name + (unavailable ? ". Unavailable; activate to hear the reason." : "."));
    });
  }

  #element(tag, text) {
    const element = this.#dialog.ownerDocument.createElement(tag);
    if (text !== undefined) element.textContent = text;
    return element;
  }

  #table(caption, rows) {
    const table = this.#element("table");
    table.append(this.#element("caption", caption));
    const head = this.#element("thead");
    const heading = this.#element("tr");
    for (const text of this.#before ? ["Reading", "Before", "After"] : ["Reading", "Opening"]) {
      const cell = this.#element("th", text);
      cell.scope = "col";
      heading.append(cell);
    }
    head.append(heading);
    table.append(head);
    const body = this.#element("tbody");
    for (const [label, before, after] of rows) {
      const row = this.#element("tr");
      const name = this.#element("th", label);
      name.scope = "row";
      row.append(name);
      if (this.#before) row.append(this.#element("td", String(before)));
      row.append(this.#element("td", String(after)));
      body.append(row);
    }
    table.append(body);
    return table;
  }

  #render() {
    this.#controls();
    const state = this.#state;
    const before = this.#before;
    const output = this.#dialog.querySelector("#practice-output");
    const title = this.#element("h3", before ? "Latest practice result · tide " + state.day : "Opening practice readings");
    const explanation = this.#element("p", before
      ? "Before is the start of this tide. After includes your action, the tide event, and dawn drift in all three cells."
      : "Each action advances one whole tide. Try the controls here, then close practice to return to your active watch.");
    const resources = this.#table("Practice resources", [
      ["Water", before?.freshwater, state.freshwater],
      ["Seed packs", before?.seedPacks, state.seedPacks],
    ]);
    const cells = this.#element("div");
    cells.className = "practice-readings";
    state.cells.forEach((cell, index) => {
      const table = this.#table(cell.name, READINGS.map(([key, label]) => [label, before?.cells[index][key], cell[key]]));
      cells.append(table);
    });
    output.replaceChildren(title, explanation, resources, cells);
    if (state.report) {
      const report = this.#element("section");
      report.setAttribute("aria-label", "Complete practice field notes");
      report.append(this.#element("h3", state.report.event.name));
      report.append(this.#element("p", state.report.event.note));
      const lines = this.#element("ol");
      state.report.lines.forEach(line => lines.append(this.#element("li", line)));
      report.append(lines);
      output.append(report);
    }
  }
}
