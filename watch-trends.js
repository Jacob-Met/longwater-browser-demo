const metrics = [
  { key: "depth", name: "Depth", unit: "cm", minimumScale: 10 },
  { key: "salinity", name: "Salt", unit: "ppt", minimumScale: 10 },
  { key: "oxygen", name: "Oxygen", unit: "%", minimumScale: 100 },
  { key: "biomass", name: "Life", unit: "%", minimumScale: 100 },
  { key: "shade", name: "Canopy", unit: "/ 3", minimumScale: 3 },
];
const colors = ["#72e2b4", "#efcb83", "#a7c9ff"];
const dashes = ["", "8 4", "2 4"];
const actionNames = { gate: "Gate", shade: "Shade", seed: "Seed" };

function element(tag, text = "", className = "") {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

function svg(tag, attributes = {}, text = "") {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  node.textContent = text;
  return node;
}

// Keep only displayed readings and accepted report identity, detached from the
// caller's native snapshot. The journal supplies the complete admitted sequence.
function reading(state) {
  return {
    day: state.day,
    cells: state.cells.map(cell => ({
      id: cell.id, name: cell.name,
      ...Object.fromEntries(metrics.map(metric => [metric.key, cell[metric.key]])),
    })),
    report: state.report ? {
      action: state.report.action, cell: state.report.cell, event: state.report.event.name,
    } : null,
  };
}

/** A read-only view of the journal's opening and completed native tides. */
export class WatchTrends {
  constructor(root) {
    this.root = root;
    this.history = [];
    this.selected = 0;
    root.id = "watch-trends";
    root.className = "watch-trends";
    const heading = element("h3", "Watch trends");
    heading.id = "trends-title";
    root.setAttribute("aria-labelledby", heading.id);
    this.scope = element("p", "", "trend-scope");
    this.scope.id = "trend-scope";
    const controls = element("div", "", "trend-controls");
    const metricLabel = element("label", "Compare a reading");
    this.metric = element("select");
    this.metric.id = "trend-metric";
    metricLabel.htmlFor = this.metric.id;
    for (const metric of metrics) {
      const option = element("option", `${metric.name} (${metric.unit})`);
      option.value = metric.key;
      this.metric.append(option);
    }
    this.metric.value = "biomass";
    metricLabel.append(this.metric);
    const tideLabel = element("label", "Review tide");
    this.range = element("input");
    this.range.id = "trend-tide";
    this.range.type = "range";
    this.range.min = "0";
    this.range.max = "0";
    this.range.step = "1";
    this.range.value = "0";
    tideLabel.htmlFor = this.range.id;
    tideLabel.append(this.range);
    controls.append(metricLabel, tideLabel);
    const help = element("p", "Choose a tide on the chart or use the slider. Arrow keys move one tide; Home returns to the opening and End to the latest completed tide.", "trend-help");
    help.id = "trend-help";
    this.range.setAttribute("aria-describedby", help.id);
    this.legend = element("ul", "", "trend-legend");
    this.chart = svg("svg", { id: "trend-chart", "aria-hidden": "true" });
    const readout = element("div", "", "trend-readout");
    readout.setAttribute("aria-live", "polite");
    readout.setAttribute("aria-atomic", "true");
    this.selectedTitle = element("h4");
    this.selectedTitle.id = "trend-selected";
    this.context = element("p", "", "trend-context");
    this.context.id = "trend-context";
    this.values = element("dl", "", "trend-values");
    this.values.id = "trend-values";
    readout.append(this.selectedTitle, this.context, this.values);
    const details = element("details", "", "trend-table-details");
    details.id = "trend-table-details";
    details.append(element("summary", "All readings for this metric"));
    this.table = element("table");
    this.table.id = "trend-table";
    this.caption = element("caption");
    this.tableHead = element("thead");
    this.tableBody = element("tbody");
    this.table.append(this.caption, this.tableHead, this.tableBody);
    details.append(this.table);
    root.append(heading, this.scope, controls, help, this.legend, this.chart, readout, details);

    this.metric.addEventListener("change", () => this.render());
    this.range.addEventListener("input", () => {
      this.selected = Number(this.range.value);
      this.renderSelection();
    });
    this.chart.addEventListener("pointerdown", event => {
      if (event.button !== 0 || this.history.length === 0) return;
      const bounds = this.chart.getBoundingClientRect();
      if (bounds.width === 0) return;
      event.preventDefault();
      const x = (event.clientX - bounds.left) * this.plot.width / bounds.width;
      const fraction = Math.max(0, Math.min(1, (x - this.plot.left) / this.plot.span));
      this.selected = Math.round(fraction * (this.history.length - 1));
      this.range.value = String(this.selected);
      this.renderSelection();
      this.range.focus({ preventScroll: true });
    });
    this.resize = new ResizeObserver(() => {
      if (this.history.length) { this.renderChart(); this.renderSelection(); }
    });
    this.resize.observe(this.chart);
  }

  start(state) {
    this.history = [reading(state)];
    this.selected = 0;
    this.legend.replaceChildren();
    for (const [index, cell] of this.history[0].cells.entries()) {
      const item = element("li");
      const sample = svg("svg", { viewBox: "0 0 32 12", "aria-hidden": "true" });
      sample.append(svg("line", { x1: 0, y1: 6, x2: 32, y2: 6, stroke: colors[index], "stroke-width": 3, "stroke-dasharray": dashes[index] }));
      item.append(sample, element("span", cell.name));
      this.legend.append(item);
    }
    this.render();
  }

  record(before, after) {
    if (before.day !== this.history.length - 1 || after.day !== before.day + 1 || after.day > 14) {
      throw new Error("Trends need the next completed journal tide.");
    }
    const followLatest = this.selected === this.history.length - 1;
    this.history.push(reading(after));
    if (followLatest) this.selected = this.history.length - 1;
    this.render();
  }

  render() {
    if (this.history.length === 0) return;
    const metric = metrics.find(item => item.key === this.metric.value);
    const last = this.history.length - 1;
    this.scope.textContent = last === 0
      ? "No completed tides yet. These are the opening readings from your watch."
      : `Opening + ${last} completed tide${last === 1 ? "" : "s"}. Changes include the action, tide and dawn drift.`;
    this.range.max = String(last);
    this.range.value = String(this.selected);
    this.caption.textContent = `${metric.name} (${metric.unit}) · Opening and every completed tide`;
    const headers = element("tr");
    for (const title of ["Tide", ...this.history[0].cells.map(cell => cell.name)]) {
      const th = element("th", title);
      th.scope = "col";
      headers.append(th);
    }
    this.tableHead.replaceChildren(headers);
    this.tableBody.replaceChildren(...this.history.map(state => {
      const row = element("tr");
      const title = element("th", state.day === 0 ? "Opening" : `Tide ${state.day}`);
      title.scope = "row";
      row.append(title);
      for (const cell of this.history[0].cells) {
        row.append(element("td", String(state.cells.find(item => item.id === cell.id)[metric.key])));
      }
      return row;
    }));
    this.renderChart();
    this.renderSelection();
  }

  renderChart() {
    const metric = metrics.find(item => item.key === this.metric.value);
    const last = this.history.length - 1;
    const width = Math.max(260, Math.round(this.chart.clientWidth || 640));
    const height = 250, left = 42, right = 20, top = 24, bottom = 44;
    const span = width - left - right;
    const values = this.history.flatMap(state => state.cells.map(cell => cell[metric.key]));
    const largest = Math.max(metric.minimumScale, ...values);
    const maximum = metric.key === "shade" ? Math.max(3, Math.ceil(largest)) : Math.ceil(largest / 10) * 10;
    const x = day => left + (last ? day / last : 0) * span;
    const y = value => height - bottom - value / maximum * (height - top - bottom);
    this.plot = { width, left, span, x, y, top, bottom: height - bottom };
    this.chart.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const children = [];
    const divisions = metric.key === "shade" ? maximum : 4;
    for (let tick = 0; tick <= divisions; tick++) {
      const value = tick / divisions * maximum;
      children.push(svg("line", { x1: left, y1: y(value), x2: width - right, y2: y(value), class: "trend-grid" }));
      children.push(svg("text", { x: left - 8, y: y(value) + 4, "text-anchor": "end", class: "trend-axis" }, String(value)));
    }
    children.push(svg("text", { x: left, y: 14, class: "trend-axis" }, `${metric.name} (${metric.unit})`));
    const tickStep = last > 6 ? Math.ceil(last / 4) : 1;
    const ticks = new Set([0, last]);
    for (let day = 0; day <= last; day += tickStep) ticks.add(day);
    for (const day of [...ticks].sort((a, b) => a - b)) {
      children.push(svg("text", { x: x(day), y: height - bottom + 19, "text-anchor": "middle", class: "trend-axis" }, String(day)));
    }
    children.push(svg("text", { x: left + span / 2, y: height - 6, "text-anchor": "middle", class: "trend-axis" }, "Completed tide · 0 = opening"));
    for (const [index, cell] of this.history[0].cells.entries()) {
      const series = this.history.map(state => ({ day: state.day, value: state.cells.find(item => item.id === cell.id)[metric.key] }));
      children.push(svg("polyline", {
        points: series.map(point => `${x(point.day)},${y(point.value)}`).join(" "),
        fill: "none", stroke: colors[index], "stroke-width": 2.5,
        "stroke-dasharray": dashes[index], "data-trend-cell": cell.id,
      }));
      for (const point of series) {
        children.push(svg("circle", { cx: x(point.day), cy: y(point.value), r: 2.5, fill: colors[index] }));
      }
    }
    this.cursor = svg("line", { class: "trend-cursor", y1: top, y2: height - bottom });
    children.push(this.cursor);
    this.chart.replaceChildren(...children);
  }

  renderSelection() {
    const state = this.history[this.selected];
    if (!state) return;
    const metric = metrics.find(item => item.key === this.metric.value);
    const title = state.day === 0 ? "Opening" : `Tide ${state.day}`;
    this.selectedTitle.textContent = `${title} · ${metric.name} (${metric.unit})`;
    this.range.setAttribute("aria-valuetext", `${title} of ${this.history.length - 1} completed tides`);
    this.context.textContent = state.report
      ? `${actionNames[state.report.action]} · ${state.cells.find(cell => cell.id === state.report.cell).name} · ${state.report.event}`
      : "Before the first action and tide.";
    this.values.replaceChildren(...this.history[0].cells.map(cell => {
      const row = element("div");
      row.append(element("dt", cell.name), element("dd", `${state.cells.find(item => item.id === cell.id)[metric.key]} ${metric.unit}`));
      return row;
    }));
    const x = this.plot.x(this.selected);
    this.cursor.setAttribute("x1", String(x));
    this.cursor.setAttribute("x2", String(x));
  }
}
