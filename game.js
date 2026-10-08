import init, { BrowserSession } from "./pkg/longwater_web.js";
import { WatchJournal } from "./journal.js";
import { SavedWatch, WATCH_SAVE_KEY, MAX_SAVE_LENGTH } from "./watch-save.js";
import { WatchChoice } from "./watch-choice.js";
import { WatchFile } from "./watch-file.js";
import { WatchRewind } from "./watch-rewind.js";
import { PracticeWatch } from "./practice-watch.js";

const canvas = document.querySelector("#game");
const live = document.querySelector("#live");
const playfield = document.querySelector("#playfield");
const resetControl = document.querySelector("#reset-control");
const resetDialog = document.querySelector("#new-watch-review");
const keepWatchControl = document.querySelector("#keep-watch");
let resetReview = null;
const cellControls = [...document.querySelectorAll("[data-cell]")];
const actionControls = [...document.querySelectorAll("[data-action]")];
const context = canvas.getContext("2d", { alpha: false });
const journal = new WatchJournal(document.querySelector("#watch-journal"));
let watch;
let watchFile;
let watchRewind;
let state;
let selected = 1;
let message = "";
let width = 0;
let height = 0;
let pixelRatio = 1;
const historicalChoice = new WatchChoice(document.querySelector("#watch-choice"), {
  readHistory: () => watch.replayHistory(),
  createSession: () => new BrowserSession(),
});

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
  // Available width depends on alignment: right-aligned text extends left
  // from x, centered text extends both ways; the old width - x - 8 formula
  // assumed left alignment and horizontally squished right/center labels
  // placed near the right edge (e.g. the ACTIVE CELL card hint).
  const avail = align === "right" ? x - 8
    : align === "center" ? 2 * Math.min(x, width - x) - 8
    : width - x - 8;
  context.fillText(String(text), x, y, Math.max(0, avail));
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
  if (l.compact) {
    // A separate resource row keeps narrow-phone counts clear of the title
    // and reset button, within the existing space above the tide panel.
    label(`WATER ${state.freshwater}`, l.pad, 70, 10, palette.water, 700);
    label(`SEED ${state.seedPacks}`, l.pad + 90, 70, 10, palette.gold, 700);
  } else {
    const right = l.restart.x - 14;
    label(`WATER ${state.freshwater}`, right, 29, 12, palette.water, 700, "right");
    label(`SEED ${state.seedPacks}`, right, 49, 12, palette.gold, 700, "right");
  }
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
  const lines = reportLines();
  const lineHeight = l.compact ? 16 : 18;
  const footerSpace = message || state.finished ? 64 : 46;
  const maxLines = Math.max(1, Math.floor((r.h - footerSpace) / lineHeight));
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
  const actions = availableActions();
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
  historicalChoice.synchronize(state);
  watchRewind?.synchronize(state);
  if (!state || !context || width <= 0 || height <= 0) return;
  const l = layout();
  drawBackground();
  drawHeader(l);
  drawEvent(l);
  state.cells.forEach((cell, i) => drawCell(cell, i, l.cards[i], l.compact));
  drawReport(l);
  drawActions(l);
  syncControls(l);
}

function resize() {
  // Keep the compact field notes above the action row even on short phones.
  playfield.style.minHeight = playfield.clientWidth < 680 ? "740px" : "650px";
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  width = rect.width;
  height = rect.height;
  pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  context?.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  positionControls(layout());
  render();
}

function availableActions() {
  return [
    { id: "gate", title: "GATE", sub: "spend 1 water", color: palette.water,
      disabled: state.freshwater < 1, reason: "Gate unavailable: no freshwater remains.",
      name: `Gate. Spend 1 water on ${state.cells[selected].name}; ${state.freshwater} water left.` },
    { id: "shade", title: "SHADE", sub: "add a canopy", color: palette.mint,
      disabled: state.cells[selected].shade >= 3, reason: "Shade unavailable: this cell's canopy is already 3 of 3.",
      name: `Shade. Add a canopy to ${state.cells[selected].name}.` },
    { id: "seed", title: "SEED", sub: `use 1 seed · ${state.seedPacks} left`, color: palette.gold,
      disabled: state.seedPacks < 1, reason: "Seed unavailable: no seed packs remain.",
      name: `Seed. Plant life in ${state.cells[selected].name}; ${state.seedPacks} seed packs left.` },
  ];
}

function cellReadings(cell) {
  return `${cell.zone}; ${cell.material}. Depth ${cell.depth} centimetres. Salt ${cell.salinity} parts per thousand. Oxygen ${cell.oxygen} percent. Life ${cell.biomass} percent. Canopy ${cell.shade} of 3.`;
}

function summary() {
  return `Day ${state.day} of 14. ${state.finished ? `Watch closed. Outcome: ${state.outcome}. ` : ""}Water ${state.freshwater}; seed packs ${state.seedPacks}.`;
}

function reportLines() {
  return state.report?.lines ?? ["Pick a cell, then choose Gate, Shade, or Seed.", "Your action is resolved against the live Rust simulation."];
}

function positionControls(l) {
  const place = (button, r) => {
    button.style.left = `${r.x}px`;
    button.style.top = `${r.y}px`;
    button.style.width = `${r.w}px`;
    button.style.height = `${r.h}px`;
  };
  place(resetControl, l.restart);
  cellControls.forEach((button, i) => place(button, l.cards[i]));
  const gap = l.compact ? 7 : 12;
  const w = (l.actions.w - 2 * gap) / 3;
  actionControls.forEach((button, i) => place(button, { ...l.actions, x: l.actions.x + i * (w + gap), w }));
}

function syncControls(l) {
  positionControls(l);
  resetControl.disabled = false;
  cellControls.forEach((button, i) => {
    button.disabled = false;
    button.setAttribute("aria-label", `Cell ${i + 1}: ${state.cells[i].name}`);
    button.setAttribute("aria-pressed", String(selected === i));
    document.querySelector(`#cell-${i}-readings`).textContent = cellReadings(state.cells[i]);
  });
  availableActions().forEach((action, i) => {
    const button = actionControls[i];
    // aria-disabled keeps the focused action discoverable after a resource is
    // spent. act() enforces the same availability used by the canvas and DOM.
    button.disabled = false;
    button.setAttribute("aria-disabled", String(action.disabled || state.finished));
    button.setAttribute("aria-label", `${action.name}${state.finished ? " Watch complete." : action.disabled ? ` ${action.reason}` : ""}`);
  });
  document.querySelector("#state-summary").textContent = summary();
  const event = state.report?.event;
  document.querySelector("#event-notes").textContent = event
    ? `${event.name}. ${event.note}`
    : "The first tide is gathering. Choose a marsh cell, then take one action before the tide turns.";
  document.querySelector("#report-lines").replaceChildren(...reportLines().map(line => {
    const item = document.createElement("li");
    item.textContent = line;
    return item;
  }));
}

function announce(includeReport = true) {
  const cell = state.cells[selected];
  const event = state.report?.event;
  live.textContent = message || `${summary()} Cell ${selected + 1}: ${cell.name} selected. ${cellReadings(cell)}${includeReport ? ` ${event ? `${event.name}. ${event.note} ` : ""}${reportLines().join(" ")}` : ""}`;
}

function selectCell(index, focus = false) {
  if (!state) return;
  const selectionChanged = index !== watch.selected;
  selected = index;
  watch.select(index);
  if (selectionChanged) watchFile?.invalidate();
  message = "";
  render();
  if (focus) cellControls[index].focus();
  announce(false);
  showSaveStatus();
}

function act(action) {
  if (!state) return;
  const choice = availableActions().find(item => item.id === action);
  if (!choice) return;
  if (state.finished || choice.disabled) {
    message = state.finished ? "Watch complete. Reset to begin another watch." : choice.reason;
    render();
    announce();
    return;
  }
  const previous = state;
  try {
    state = JSON.parse(watch.takeTurn(action));
    message = "";
  } catch (error) {
    message = String(error).replace(/^Error:\s*/, "");
  }
  if (state !== previous) {
    watchFile?.invalidate();
    journal.record(previous, state);
  }
  render();
  announce();
  showSaveStatus();
}

function refreshRestoredWatch() {
  try {
    const restored = JSON.parse(watch.snapshot);
    journal.restore(watch.replayHistory());
    state = restored;
    selected = watch.selected;
    message = "";
    render();
    announce();
    showSaveStatus();
  } catch (error) {
    // The imported watch is already active. Keep its file/save recovery
    // available, but do not accept play against a display that is stale.
    state = null;
    historicalChoice.synchronize(null);
    watchRewind?.synchronize(null);
    document.querySelector("#watch-journal").hidden = true;
    [resetControl, ...cellControls, ...actionControls].forEach(button => { button.disabled = true; });
    showSaveStatus();
    throw error;
  }
}

function reset() {
  if (!watch) return;
  state = JSON.parse(watch.reset());
  watchFile?.invalidate();
  journal.start(state);
  selected = watch.selected;
  message = "";
  render();
  announce();
  showSaveStatus();
}

function requestReset() {
  if (!watch || !state || resetDialog.open) return;
  resetReview = {
    watch,
    snapshot: watch.snapshot,
    selected: watch.selected,
    trigger: document.activeElement,
  };
  document.querySelector("#new-watch-progress").textContent =
    "This watch has completed " + state.day + " of 14 tides.";
  try {
    resetDialog.showModal();
    keepWatchControl.focus();
  } catch {
    resetReview = null;
    live.textContent = "The new-watch review could not open. Your current watch is unchanged.";
  }
}

function closeResetReview(notice) {
  const trigger = resetReview?.trigger;
  resetReview = null;
  resetDialog.close();
  trigger?.focus();
  if (notice) live.textContent = notice;
}

keepWatchControl.addEventListener("click", () => {
  closeResetReview("Kept this watch. Your progress and journal are unchanged.");
});
resetDialog.addEventListener("cancel", event => {
  event.preventDefault();
  closeResetReview("Kept this watch. Your progress and journal are unchanged.");
});
document.querySelector("#start-new-watch").addEventListener("click", () => {
  if (!resetReview) return;
  const reviewed = resetReview;
  // A later accepted watch must be reviewed again before it can be replaced.
  if (watch !== reviewed.watch || watch.snapshot !== reviewed.snapshot || watch.selected !== reviewed.selected) {
    closeResetReview("This watch changed. Review again before starting a new watch.");
    return;
  }
  closeResetReview();
  reset();
});

function showSaveStatus() {
  if (!watch) return;
  const status = watch.status;
  document.querySelector("#watch-save-status").textContent = status.message;
  document.querySelector("#watch-save-retry").hidden = !status.canRetry;
}

resetControl.addEventListener("click", requestReset);
cellControls.forEach((button, i) => button.addEventListener("click", () => selectCell(i)));
actionControls.forEach(button => button.addEventListener("click", () => act(button.dataset.action)));
playfield.addEventListener("keydown", event => {
  if (!state || !event.target.closest(".game-control") || event.altKey || event.ctrlKey || event.metaKey || event.isComposing || event.repeat) return;
  if (["1", "2", "3"].includes(event.key)) {
    event.preventDefault();
    selectCell(Number(event.key) - 1, true);
  } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    selectCell((selected + (event.key === "ArrowRight" ? 1 : 2)) % 3, true);
  } else {
    const shortcuts = { g: "gate", h: "shade", s: "seed" };
    const key = event.key.toLowerCase();
    if (Object.hasOwn(shortcuts, key)) {
      event.preventDefault();
      act(shortcuts[key]);
    } else if (key === "r") {
      event.preventDefault();
      requestReset();
    }
  }
});
window.addEventListener("resize", resize);
window.addEventListener("storage", event => {
  if (watch && (event.key === WATCH_SAVE_KEY || event.key === null)) {
    watch.storageChanged();
    watchRewind?.invalidate("The saved watch changed. Review the latest tide again.");
    watchFile?.invalidate("The saved watch changed. Open the file again to review replacement.");
    showSaveStatus();
    if (resetReview) {
      closeResetReview("The saved watch changed in another tab. Review again before starting a new watch.");
    }
  }
});
document.querySelector("#watch-save-retry").addEventListener("click", () => {
  watch?.save();
  showSaveStatus();
});

try {
  resize();
  if (!context) throw new Error("This browser cannot create the game canvas.");
  await init();
  watch = new SavedWatch({ createSession: () => new BrowserSession(), getStorage: () => window.localStorage });
  state = JSON.parse(watch.snapshot);
  selected = watch.selected;
  journal.restore(watch.replayHistory());
  journal.setLifetime("Saved tides return with your watch, including watches opened from a file. If saving is unavailable, download your watch before closing to keep the latest reports.");
  watchFile = new WatchFile(document.querySelector("#watch-files"), {
    watch,
    maxLength: MAX_SAVE_LENGTH,
    onRestore: refreshRestoredWatch,
  });
  watchRewind = new WatchRewind(document.querySelector("#watch-rewind"), {
    watch,
    onRewind() {
      watchFile?.invalidate();
      refreshRestoredWatch();
    },
  });
  resize();
  announce();
  showSaveStatus();
  new PracticeWatch(document.querySelector("#practice-watch"), document.querySelector("#practice-open"), () => new BrowserSession());
} catch (error) {
  live.textContent = `Longwater could not start: ${String(error)}`;
  const errorMessage = document.querySelector("#startup-error");
  errorMessage.textContent = live.textContent;
  errorMessage.hidden = false;
  document.querySelector("#watch-save-status").textContent = "The game could not start. Any saved watch has been kept.";
}
