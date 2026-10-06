import init, { BrowserSession } from "./pkg/longwater_web.js";

const canvas = document.querySelector("#game");
const live = document.querySelector("#live");
const context = canvas.getContext("2d", { alpha: false });
let session;
let state;
let selected = 1;
let message = "";
let width = 0;
let height = 0;
let pixelRatio = 1;

const palette = {
  night: "#071b22", deep: "#0b2930", panel: "#102f35", card: "#11363a",
  cardSelected: "#153f40", border: "#2a5650", mint: "#72e2b4", paper: "#e6f0e5",
  muted: "#a8c1b4", gold: "#efcb83", rose: "#ff9a81", water: "#58b5b1",
};

function rounded(x, y, w, h, r, fill, stroke = null, line = 1) {
  context.beginPath();
  context.roundRect(x, y, w, h, r);
  context.fillStyle = fill;
  context.fill();
  if (stroke) {
    context.lineWidth = line;
    context.strokeStyle = stroke;
    context.stroke();
  }
}

function label(text, x, y, size, color, weight = 500, align = "left") {
  context.font = `${weight} ${size}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
  context.textAlign = align;
  context.textBaseline = "alphabetic";
  context.fillStyle = color;
  context.fillText(String(text), x, y, Math.max(0, width - x - 8));
}

function wrap(text, maxWidth, font) {
  context.font = font;
  const out = [];
  let line = "";
  for (const word of String(text).split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && context.measureText(next).width > maxWidth) {
      out.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) out.push(line);
  return out;
}

function layout() {
  const compact = width < 680;
  const pad = compact ? 18 : 34;
  const event = { x: pad, y: 82, w: width - pad * 2, h: compact ? 82 : 96 };
  const cellsTop = event.y + event.h + (compact ? 9 : 13);
  const cards = [];
  if (compact) {
    const cardH = 108;
    for (let i = 0; i < 3; i++) cards.push({ x: pad, y: cellsTop + i * (cardH + 8), w: width - 2 * pad, h: cardH });
  } else {
    const gap = 14;
    const cardW = (width - 2 * pad - 2 * gap) / 3;
    for (let i = 0; i < 3; i++) cards.push({ x: pad + i * (cardW + gap), y: cellsTop, w: cardW, h: 218 });
  }
  const cardsBottom = compact ? cards[2].y + cards[2].h : cards[0].y + cards[0].h;
  const reportY = cardsBottom + (compact ? 10 : 14);
  const actionY = height - (compact ? 106 : 116);
  const actionH = compact ? 94 : 98;
  return {
    compact, pad, event, cards,
    report: { x: pad, y: reportY, w: width - 2 * pad, h: Math.max(94, actionY - reportY - 12) },
    actions: { x: pad, y: actionY, w: width - 2 * pad, h: actionH },
    restart: { x: width - pad - 80, y: 16, w: 80, h: 32 },
  };
}

function drawBackground() {
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#071b22");
  gradient.addColorStop(0.56, "#0a272d");
  gradient.addColorStop(1, "#081c22");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  context.globalAlpha = 0.15;
  for (let row = 0; row < 5; row++) {
    context.beginPath();
    const y = height - 18 - row * 22;
    context.moveTo(0, y);
    for (let x = 0; x <= width + 24; x += 24) {
      context.lineTo(x, y + Math.sin((x / 58) + row * 0.9) * 3.2);
    }
    context.strokeStyle = row % 2 ? palette.water : palette.mint;
    context.lineWidth = 1;
    context.stroke();
  }
  context.globalAlpha = 1;
}

function drawHeader(l) {
  label("LONGWATER", l.pad, 33, l.compact ? 22 : 27, palette.paper, 760);
  label("FOURTEEN TIDES · FIELD SIM", l.pad + 1, 51, 9, palette.muted, 650);
  const right = width - l.pad;
  label(`WATER ${state.freshwater}`, right, 29, l.compact ? 10 : 12, palette.water, 700, "right");
  label(`SEED ${state.seedPacks}`, right, 49, l.compact ? 10 : 12, palette.gold, 700, "right");
  rounded(l.restart.x, l.restart.y, l.restart.w, l.restart.h, 12, "#183c3d", "#346259");
  label("↻  RESET", l.restart.x + l.restart.w / 2, l.restart.y + 21, 10, palette.paper, 700, "center");
}

function drawEvent(l) {
  const r = l.event;
  rounded(r.x, r.y, r.w, r.h, 16, palette.panel, "#244a49");
  const event = state.report?.event;
  const title = state.finished ? `${state.outcome ?? "Complete"} · watch closed` : (event?.name ?? "The first tide is gathering");
  label(state.finished ? "FINAL TIDE" : `DAY ${state.day} / 14`, r.x + 14, r.y + 19, 9, palette.mint, 750);
  label(title, r.x + 14, r.y + 41, l.compact ? 16 : 19, palette.paper, 700);
  const note = event?.note ?? "Choose a marsh cell, then take one action before the tide turns.";
  const noteLines = wrap(note, r.w - 28, `${l.compact ? 10 : 12}px ui-sans-serif, system-ui`);
  if (l.compact) label(noteLines[0] ?? "", r.x + 14, r.y + 63, 10, palette.muted, 450);
  else {
    label(noteLines[0] ?? "", r.x + 14, r.y + 63, 11, palette.muted, 450);
    label(noteLines[1] ?? "", r.x + 14, r.y + 79, 11, palette.muted, 450);
  }
  const barY = r.y + r.h - 10;
  const gap = 4;
  const segmentW = (r.w - 28 - gap * 13) / 14;
  for (let i = 0; i < 14; i++) {
    rounded(r.x + 14 + i * (segmentW + gap), barY, segmentW, 3, 2,
      i < state.day ? palette.mint : "#31504d");
  }
}

function statBar(x, y, w, title, value, color, compact) {
  label(title, x, y, compact ? 8 : 9, palette.muted, 650);
  label(value, x + w, y, compact ? 10 : 12, palette.paper, 700, "right");
  rounded(x, y + 6, w, 4, 2, "#254747");
  rounded(x, y + 6, Math.max(2, w * Math.max(0, Math.min(100, Number(value))) / 100), 4, 2, color);
}

function drawCell(cell, i, rect, compact) {
  const active = selected === i;
  rounded(rect.x, rect.y, rect.w, rect.h, 16, active ? palette.cardSelected : palette.card,
    active ? palette.mint : palette.border, active ? 2 : 1);
  const left = rect.x + 14;
  const innerW = rect.w - 28;
  label(`${String(i + 1).padStart(2, "0")}  ${cell.name}`, left, rect.y + 24, compact ? 14 : 16, palette.paper, 720);
  label(`${cell.zone}  ·  ${cell.material}`, left, rect.y + 41, compact ? 9 : 10, palette.muted, 450);
  const stats = [
    ["DEPTH", cell.depth, palette.water],
    ["SALT", cell.salinity, palette.gold],
    ["OXYGEN", cell.oxygen, palette.mint],
    ["LIFE", cell.biomass, "#a8d87a"],
  ];
  if (compact) {
    const gap = 7;
    const unit = (innerW - 3 * gap) / 4;
    stats.forEach((s, n) => statBar(left + n * (unit + gap), rect.y + 64, unit, s[0], s[1], s[2], true));
    label(`CANOPY ${cell.shade}/3`, left, rect.y + 96, 9, active ? palette.mint : palette.muted, 650);
    label(active ? "SELECTED" : "TAP TO SELECT", rect.x + rect.w - 14, rect.y + 96, 8, palette.muted, 600, "right");
  } else {
    const gap = 18;
    const unit = (innerW - gap) / 2;
    stats.forEach((s, n) => {
      const col = n % 2;
      const row = Math.floor(n / 2);
      statBar(left + col * (unit + gap), rect.y + 81 + row * 43, unit, s[0], s[1], s[2], false);
    });
    label(`REED CANOPY   ${cell.shade} / 3`, left, rect.y + rect.h - 19, 10, active ? palette.mint : palette.muted, 650);
    label(active ? "ACTIVE CELL" : "SELECT", rect.x + rect.w - 14, rect.y + rect.h - 19, 9, palette.muted, 600, "right");
  }
}

function drawReport(l) {
  const r = l.report;
  rounded(r.x, r.y, r.w, r.h, 16, "rgba(11, 36, 41, .95)", "#244642");
  label("FIELD NOTES", r.x + 15, r.y + 22, 10, palette.mint, 750);
  const lines = state.report?.lines ?? ["Pick a cell, then choose Gate, Shade, or Seed.", "Your action is resolved against the live Rust simulation."];
  const lineHeight = l.compact ? 16 : 18;
  const maxLines = Math.max(2, Math.floor((r.h - 46) / lineHeight));
  let visible = [];
  for (const line of lines) visible.push(...wrap(line, r.w - 30, `${l.compact ? 11 : 12}px ui-sans-serif, system-ui`));
  visible = visible.slice(0, maxLines);
  visible.forEach((line, index) => label(line, r.x + 15, r.y + 45 + index * lineHeight, l.compact ? 11 : 12,
    message ? palette.rose : (state.finished ? palette.gold : palette.paper), 480));
  if (message) {
    label(message, r.x + 15, r.y + r.h - 12, l.compact ? 10 : 11, palette.rose, 650);
  } else if (!state.finished && r.h > 140) {
    const y = r.y + r.h - 14;
    label("Select a cell card · Gate spends water · Shade builds canopy · Seed plants life", r.x + 15, y, 10, palette.muted, 500);
  } else if (state.finished) {
    label("Tap RESET to begin another watch.", r.x + 15, r.y + r.h - 12, 10, palette.gold, 600);
  }
}

function drawActions(l) {
  const r = l.actions;
  const actions = [
    { id: "gate", title: "GATE", sub: "spend 1 water", color: palette.water, disabled: state.freshwater < 1 },
    { id: "shade", title: "SHADE", sub: "add a canopy", color: palette.mint, disabled: state.cells[selected].shade >= 3 },
    { id: "seed", title: "SEED", sub: `use 1 seed · ${state.seedPacks} left`, color: palette.gold, disabled: state.seedPacks < 1 },
  ];
  const gap = l.compact ? 7 : 12;
  const buttonW = (r.w - 2 * gap) / 3;
  actions.forEach((action, i) => {
    const x = r.x + i * (buttonW + gap);
    const disabled = action.disabled || state.finished;
    rounded(x, r.y, buttonW, r.h, 15, disabled ? "#182d30" : "#143d3c", disabled ? "#314346" : action.color, 1.5);
    context.globalAlpha = disabled ? 0.45 : 1;
    label(action.title, x + buttonW / 2, r.y + (l.compact ? 34 : 36), l.compact ? 13 : 16,
      disabled ? palette.muted : action.color, 800, "center");
    label(action.sub, x + buttonW / 2, r.y + (l.compact ? 56 : 61), l.compact ? 8 : 10,
      disabled ? palette.muted : palette.paper, 520, "center");
    label(disabled ? (state.finished ? "WATCH COMPLETE" : "UNAVAILABLE") : "TAP / CLICK", x + buttonW / 2,
      r.y + r.h - 12, 7, palette.muted, 650, "center");
    context.globalAlpha = 1;
  });
}

function render() {
  if (!state || !context || width <= 0 || height <= 0) return;
  const l = layout();
  drawBackground();
  drawHeader(l);
  drawEvent(l);
  state.cells.forEach((cell, i) => drawCell(cell, i, l.cards[i], l.compact));
  drawReport(l);
  drawActions(l);
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  width = rect.width;
  height = rect.height;
  pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  render();
}

function announce() {
  const last = state.report?.event?.name;
  live.textContent = message || (state.finished
    ? `Fourteen tides complete. Outcome: ${state.outcome}.`
    : `Day ${state.day} of 14. ${last ? `${last}. ` : ""}Water ${state.freshwater}; seeds ${state.seedPacks}.`);
}

function act(action) {
  if (!state || state.finished) return;
  try {
    state = JSON.parse(session.take_turn(action, state.cells[selected].id));
    message = "";
  } catch (error) {
    message = String(error).replace(/^Error:\s*/, "");
  }
  render();
  announce();
}

function reset() {
  if (!session) return;
  state = JSON.parse(session.restart());
  selected = 1;
  message = "";
  render();
  announce();
}

function pointerUp(event) {
  event.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * width / rect.width;
  const y = (event.clientY - rect.top) * height / rect.height;
  const l = layout();
  if (x >= l.restart.x && x <= l.restart.x + l.restart.w && y >= l.restart.y && y <= l.restart.y + l.restart.h) {
    reset();
    return;
  }
  const cardIndex = l.cards.findIndex(card => x >= card.x && x <= card.x + card.w && y >= card.y && y <= card.y + card.h);
  if (cardIndex >= 0) {
    selected = cardIndex;
    message = "";
    render();
    announce();
    return;
  }
  const r = l.actions;
  if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) return;
  const gap = l.compact ? 7 : 12;
  const buttonW = (r.w - 2 * gap) / 3;
  const index = Math.floor((x - r.x) / (buttonW + gap));
  const localX = (x - r.x) - index * (buttonW + gap);
  if (index < 0 || index > 2 || localX > buttonW) return;
  act(["gate", "shade", "seed"][index]);
}

canvas.addEventListener("pointerup", pointerUp);
canvas.addEventListener("keydown", event => {
  const keys = { "1": 0, "2": 1, "3": 2 };
  if (event.key in keys) {
    selected = keys[event.key];
    message = "";
    render();
    announce();
  } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    selected = (selected + (event.key === "ArrowRight" ? 1 : 2)) % 3;
    render();
  } else if (event.key.toLowerCase() === "g") act("gate");
  else if (event.key.toLowerCase() === "h") act("shade");
  else if (event.key.toLowerCase() === "s") act("seed");
  else if (event.key.toLowerCase() === "r") reset();
});
window.addEventListener("resize", resize);

try {
  await init();
  session = new BrowserSession();
  state = JSON.parse(session.snapshot_json());
  resize();
  announce();
} catch (error) {
  live.textContent = `Longwater could not start: ${String(error)}`;
  context.fillStyle = palette.night;
  context.fillRect(0, 0, canvas.width, canvas.height);
  label("LONGWATER COULD NOT START", 24, 44, 18, palette.rose, 700);
  label(String(error), 24, 76, 12, palette.paper, 500);
}
