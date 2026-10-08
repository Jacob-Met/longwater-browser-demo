const actions = { gate: "Gate", shade: "Shade", seed: "Seed" };
const readings = [
  ["Depth", "depth", "cm"], ["Salt", "salinity", "ppt"],
  ["Oxygen", "oxygen", "%"], ["Life", "biomass", "%"], ["Canopy", "shade", "/ 3"],
];
const escape = value => String(value).replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]));
const row = (tag, value, attributes = "") => "<" + tag + attributes + ">" + escape(value) + "</" + tag + ">";

function checkSnapshots(states) {
  if (!Array.isArray(states) || states.length < 2 || states.length > 15) {
    throw new Error("A watch report needs its opening and one to fourteen completed tides.");
  }
  const ids = states[0]?.cells?.map(cell => cell.id);
  if (!ids || ids.length !== 3 || new Set(ids).size !== 3) throw new Error("Missing opening cells.");
  for (const [index, state] of states.entries()) {
    if (state.day !== index || !Array.isArray(state.cells) || state.cells.length !== ids.length ||
        new Set(state.cells.map(cell => cell.id)).size !== ids.length ||
        state.cells.some(cell => !ids.includes(cell.id) || typeof cell.name !== "string" ||
          readings.some(([, key]) => !Number.isFinite(cell[key]))) ||
        !Number.isFinite(state.freshwater) || !Number.isFinite(state.seedPacks) ||
        typeof state.finished !== "boolean" || (state.finished && index !== states.length - 1)) {
      throw new Error("A watch report requires the complete ordered native snapshots.");
    }
    if (index > 0) {
      const report = state.report;
      if (report?.day !== index || !Object.hasOwn(actions, report.action) || !ids.includes(report.cell) ||
          typeof report.event?.name !== "string" || typeof report.event?.note !== "string" ||
          !Array.isArray(report.lines) || report.lines.some(line => typeof line !== "string")) {
        throw new Error("Missing accepted tide report.");
      }
    }
    if (state.finished && typeof state.outcome !== "string") throw new Error("Missing native outcome.");
  }
}

function cellTable(before, after, caption) {
  const headers = row("th", "Cell", ' scope="col"') +
    readings.map(([label, , unit]) => row("th", label + " (" + unit + ")", ' scope="col"')).join("");
  const body = after.cells.map(cell => {
    const previous = before?.cells.find(item => item.id === cell.id);
    return '<tr data-cell-id="' + escape(cell.id) + '">' + row("th", cell.name, ' scope="row"') +
      readings.map(([, key]) => row("td", previous ? previous[key] + " → " + cell[key] : cell[key],
        ' data-reading="' + key + '"')).join("") + "</tr>";
  }).join("");
  return '<div class="table-wrap" role="region" tabindex="0" aria-label="' + escape(caption) + '"><table><caption>' + escape(caption) +
    "</caption><thead><tr>" + headers + "</tr></thead><tbody>" + body + "</tbody></table></div>";
}

function resources(before, after) {
  return '<p class="resources">Freshwater: ' + escape(before ? before.freshwater + " → " + after.freshwater : after.freshwater) +
    ". Seed packs: " + escape(before ? before.seedPacks + " → " + after.seedPacks : after.seedPacks) + ".</p>";
}

const reportStyle = [
  ":root{color-scheme:light;font-family:system-ui,sans-serif;color:#18322d;background:#f7faf6;line-height:1.55}",
  "body{max-width:70rem;margin:0 auto;padding:2rem}h1{margin-bottom:.3rem}h2{margin-top:2rem}",
  ".provenance,.status{max-width:65ch}.status{font-weight:700}.tide{border-top:2px solid #92b4a3;margin-top:2rem;padding-top:.5rem;break-inside:avoid}",
  ".table-wrap{overflow-x:auto}.table-wrap:focus-visible{outline:3px solid #346d50;outline-offset:3px}table{border-collapse:collapse;width:100%;min-width:32rem;margin:1rem 0;font-variant-numeric:tabular-nums}",
  "caption{text-align:left;font-weight:700;margin-bottom:.5rem}th,td{text-align:left;padding:.5rem;border:1px solid #adc3b7;vertical-align:top}",
  "thead{background:#e5efe7}p,li,th,td{overflow-wrap:anywhere}.notes{white-space:pre-wrap}footer{border-top:1px solid #adc3b7;margin-top:2rem;font-size:.9rem}",
  "@media(max-width:40rem){body{padding:1rem}th,td{padding:.35rem;font-size:.85rem}}",
  "@media print{:root{background:white;color:black}body{max-width:none;padding:0}.table-wrap{overflow:visible}table{min-width:0}thead{display:table-header-group}h2,h3{break-after:avoid}.tide{break-inside:auto}tr{break-inside:avoid}}",
].join("\n");

/** Render only accepted journal snapshots. This neither replays nor changes a watch. */
export function createWatchReport(states) {
  checkSnapshots(states);
  const opening = states[0], last = states.at(-1);
  const status = last.finished ? "Watch closed · " + last.outcome : "Partial watch · " + last.day + " of 14 tides completed";
  const title = "Longwater watch report";
  const openingHtml = '<section id="report-opening"><h2>Opening readings</h2>' +
    resources(null, opening) + cellTable(null, opening, "Before the first tide") + "</section>";
  const tides = states.slice(1).map((state, index) => {
    const before = states[index], report = state.report;
    const cell = state.cells.find(item => item.id === report.cell);
    return '<section class="tide" data-tide="' + state.day + '"><h2>' +
      escape("Tide " + state.day + " · " + actions[report.action] + " · " + cell.name) +
      '</h2><h3 class="event-name">' + escape(report.event.name) + '</h3><p class="event-note">' +
      escape(report.event.note) + '</p><h3>Full field notes</h3><ul class="notes">' +
      report.lines.map(line => row("li", line)).join("") + "</ul>" +
      resources(before, state) + cellTable(before, state, "Before → after tide " + state.day) + "</section>";
  }).join("");
  const overview = '<section id="report-overview"><h2>' +
    (last.finished ? "Opening → final readings" : "Opening → current readings") + "</h2>" +
    resources(opening, last) + cellTable(opening, last, last.finished ? "Across the completed watch" : "Across the completed tides so far") + "</section>";
  const html = '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'">' +
    "<title>" + title + "</title><style>" + reportStyle + "</style></head><body><header><h1>" + title +
    '</h1><p id="report-status" class="status">' + escape(status) +
    '</p><p class="provenance">A one-time snapshot of this Longwater game’s accepted journal. ' +
    "Recorded from Longwater’s game simulation. " +
    "Net changes include the action, the tide and dawn drift.</p>" +
    "<p>This report can be read or printed without the game. It does not resume a watch or update when play continues.</p></header><main>" +
    overview + openingHtml + tides + "</main><footer><p>" + escape(last.day + " of 14 tides recorded.") +
    " Only completed tides are included. Print using your browser’s Print command.</p></footer></body></html>\n";
  return { html, filename: "Longwater-watch-tide-" + String(last.day).padStart(2, "0") + ".html", day: last.day };
}

export class WatchReport {
  constructor(root) {
    this.states = [];
    this.root = root;
    root.className = "watch-report";
    this.button = document.createElement("button");
    this.button.id = "watch-report-download";
    this.button.type = "button";
    this.button.textContent = "Download watch report";
    this.button.disabled = true;
    const note = document.createElement("p");
    note.id = "watch-report-note";
    note.textContent = "Keep a readable, printable snapshot of this watch. This report cannot resume the game.";
    this.button.setAttribute("aria-describedby", note.id);
    this.status = document.createElement("p");
    this.status.id = "watch-report-status";
    this.status.setAttribute("role", "status");
    this.status.setAttribute("aria-live", "polite");
    root.append(this.button, note, this.status);
    this.button.addEventListener("click", () => this.download());
  }

  start(state) {
    this.states = [structuredClone(state)];
    this.refresh();
  }

  record(state) {
    this.states.push(structuredClone(state));
    this.refresh();
  }

  refresh() {
    this.button.disabled = this.states.length < 2;
    this.status.textContent = this.button.disabled ? "Complete a tide to download a report." : "";
  }

  download() {
    if (this.button.disabled) return;
    let url, anchor;
    try {
      const report = createWatchReport(this.states);
      url = URL.createObjectURL(new Blob([report.html], { type: "text/html;charset=utf-8" }));
      anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = report.filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      anchor = null;
      const completedUrl = url;
      setTimeout(() => URL.revokeObjectURL(completedUrl), 1000);
      url = null;
      this.status.textContent = "Report download requested for tide " + report.day + " of 14. Your watch is unchanged.";
    } catch {
      this.status.textContent = "Could not prepare the report. Your watch is unchanged. Try Download watch report again.";
    } finally {
      anchor?.remove();
      if (url) URL.revokeObjectURL(url);
    }
  }
}
