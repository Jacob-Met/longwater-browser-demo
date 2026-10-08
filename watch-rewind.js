// Review the latest whole tide; SavedWatch alone admits the shorter history.
export class WatchRewind {
  #watch;
  #onRewind;
  #open;
  #dialog;
  #keep;
  #confirm;
  #status;
  #hint;
  #summary;
  #effect;
  #resources;
  #saveNote;
  #state = null;
  #source = null;
  #preview = null;
  #trigger = null;

  constructor(root, { watch, onRewind }) {
    this.#watch = watch;
    this.#onRewind = onRewind;
    this.#open = root.querySelector("#watch-rewind-open");
    this.#dialog = root.querySelector("#watch-rewind-review");
    this.#keep = root.querySelector("#watch-rewind-keep");
    this.#confirm = root.querySelector("#watch-rewind-confirm");
    this.#status = root.querySelector("#watch-rewind-status");
    this.#hint = root.querySelector("#watch-rewind-hint");
    this.#summary = root.querySelector("#watch-rewind-summary");
    this.#effect = root.querySelector("#watch-rewind-effect");
    this.#resources = root.querySelector("#watch-rewind-resources");
    this.#saveNote = root.querySelector("#watch-rewind-save-note");
    this.#open.addEventListener("click", () => this.#request());
    this.#keep.addEventListener("click", () => this.#cancel());
    this.#confirm.addEventListener("click", () => this.#apply());
    this.#dialog.addEventListener("cancel", event => {
      event.preventDefault();
      this.#cancel();
    });
    this.#dialog.addEventListener("close", () => {
      if (!this.#dialog.open && this.#preview) this.#cancel();
    });
  }

  synchronize(state) {
    if (!state) {
      if (this.#state !== null || this.#preview) {
        this.invalidate("The watch display is unavailable. Download watch to keep the accepted progress.");
      } else this.#watch.cancelRewind();
      this.#state = null;
      this.#source = null;
      this.#open.disabled = true;
      return;
    }
    const source = this.#watch.exportFile();
    if (state !== this.#state || source !== this.#source) this.invalidate();
    this.#state = state;
    this.#source = source;
    this.#open.disabled = state.day < 1;
    this.#hint.textContent = state.day < 1
      ? "Complete a tide to review a rewind."
      : "Review the latest tide before removing it.";
  }

  invalidate(message = "This watch changed. Review the latest tide again.") {
    const pending = this.#preview;
    this.#close(pending ? message : "");
  }

  #otherDialogOpen() {
    return [...document.querySelectorAll("dialog[open]")].some(dialog => dialog !== this.#dialog);
  }

  #request() {
    if (!this.#state || this.#open.disabled || this.#dialog.open || this.#otherDialogOpen()) return;
    try {
      if (this.#source !== this.#watch.exportFile()) throw new Error("The watch display changed. Review it again before rewinding.");
      const preview = this.#watch.previewRewind();
      const current = JSON.parse(preview.currentSnapshot);
      const previous = JSON.parse(preview.previousSnapshot);
      const action = { gate: "Gate", shade: "Shade", seed: "Seed" }[preview.action];
      this.#summary.textContent = "Remove tide " + preview.day + ": " + action + " at " + preview.cellName
        + ". Return to day " + preview.targetDay + " of 14.";
      this.#effect.textContent = "The whole tide will be removed, including its action, tide event and journal entry. "
        + "Earlier tides return to their previous state. " + preview.selectedCell + " stays selected.";
      this.#resources.textContent = "Water: " + current.freshwater + " → " + previous.freshwater
        + ". Seed packs: " + current.seedPacks + " → " + previous.seedPacks + ".";
      const kind = this.#watch.status.kind;
      this.#saveNote.textContent = kind === "protected" || kind === "changed"
        ? "The other saved watch is protected. Rewinding changes only this page's watch and keeps that saved data. Download the current watch first if you want to keep it."
        : kind === "unavailable"
          ? "Browser saving has not succeeded. The shorter watch will stay available on this page; download it if saving remains unavailable. Download the current watch first if you want both."
          : "The shorter watch will replace this browser's save when saving succeeds. Download your current watch first to keep it.";
      this.#preview = preview;
      this.#trigger = document.activeElement;
      this.#confirm.textContent = "Rewind tide " + preview.day;
      this.#confirm.disabled = false;
      this.#dialog.showModal();
      this.#keep.focus();
    } catch (error) {
      this.#close(String(error.message || error) + " Your current watch has been kept.");
    }
  }

  #close(message) {
    const focused = this.#dialog.contains(document.activeElement);
    const trigger = this.#trigger;
    this.#preview = null;
    this.#trigger = null;
    this.#watch.cancelRewind();
    if (this.#dialog.open) this.#dialog.close();
    this.#status.textContent = message;
    if (focused && trigger?.isConnected && !trigger.disabled) trigger.focus();
  }

  #cancel() {
    this.#close("Kept this watch. Its tides, journal and saved progress are unchanged.");
  }

  #apply() {
    if (!this.#preview || !this.#dialog.open || this.#otherDialogOpen()) return;
    const preview = this.#preview;
    this.#confirm.disabled = true;
    try {
      this.#watch.rewind(preview);
    } catch (error) {
      this.#close(String(error.message || error) + " Your current watch has been kept.");
      return;
    }
    this.#close("");
    try {
      this.#onRewind();
      this.#status.textContent = "Rewound tide " + preview.day + ". Day " + preview.targetDay
        + " of 14 is active with its complete journal. "
        + (this.#watch.status.kind === "saved"
          ? "This watch is saved in this browser."
          : "Browser saving has not succeeded. Download watch to keep this shorter watch.");
    } catch {
      // Admission has already succeeded. Keep the accepted watch recoverable;
      // never report cancellation or promise a reload of an unsaved watch.
      this.#status.textContent = "Rewound tide " + preview.day + ". The watch display could not be refreshed. "
        + (this.#watch.status.kind === "saved"
          ? "It is saved in this browser. Reload this page to resume it."
          : "It has not been saved in this browser. Download watch before reloading or closing.");
    }
    if (!this.#open.disabled) this.#open.focus();
    else this.#status.focus();
  }
}
