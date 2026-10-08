// This controller owns file selection and confirmation, never simulation state.
// SavedWatch admits each file through the same native replay as browser resume.
export class WatchFile {
  #watch;
  #maxLength;
  #onRestore;
  #input;
  #open;
  #status;
  #panel;
  #summary;
  #title;
  #generation = 0;
  #reading = false;
  #preview = null;

  constructor(root, { watch, maxLength, onRestore }) {
    this.#watch = watch;
    this.#maxLength = maxLength;
    this.#onRestore = onRestore;
    this.#input = root.querySelector("#watch-file-input");
    this.#open = root.querySelector("#watch-file-open");
    this.#status = root.querySelector("#watch-file-status");
    this.#panel = root.querySelector("#watch-file-preview");
    this.#summary = root.querySelector("#watch-file-summary");
    this.#title = root.querySelector("#watch-file-preview-title");
    const download = root.querySelector("#watch-file-download");
    download.addEventListener("click", () => this.#download());
    this.#open.addEventListener("click", () => {
      this.#clear("");
      this.#input.click();
    });
    this.#input.addEventListener("change", () => {
      const file = this.#input.files?.[0];
      this.#input.value = "";
      if (file) this.#read(file);
    });
    root.querySelector("#watch-file-cancel").addEventListener("click", () => {
      this.#clear("No watch was replaced.");
      this.#open.focus();
    });
    root.querySelector("#watch-file-confirm").addEventListener("click", () => this.#replace());
    this.#panel.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.#clear("No watch was replaced.");
        this.#open.focus();
      }
    });
    download.disabled = false;
    this.#open.disabled = false;
  }

  #clear(message) {
    this.#generation++;
    this.#reading = false;
    this.#preview = null;
    this.#watch.cancelFile();
    const focused = this.#panel.contains(document.activeElement);
    this.#panel.hidden = true;
    this.#input.value = "";
    this.#status.textContent = message;
    if (focused) this.#open.focus();
  }

  invalidate(message = "The watch changed. Open the file again to review it.") {
    const pending = this.#reading || this.#preview;
    this.#clear(pending ? message : "");
  }

  async #read(file) {
    this.#clear("");
    const generation = this.#generation;
    if (file.size > this.#maxLength) {
      this.#status.textContent = "That file is too large. Choose a Longwater watch file up to 32 KB.";
      return;
    }
    this.#reading = true;
    this.#status.textContent = "Checking this watch file…";
    try {
      const raw = await file.text();
      if (generation !== this.#generation) return;
      const preview = this.#watch.previewFile(raw);
      this.#reading = false;
      this.#preview = preview;
      this.#title.textContent = "Open " + file.name + "?";
      this.#summary.textContent = "Day " + preview.day + " of 14. " + preview.cell + " selected. "
        + (preview.finished ? "Watch complete: " + preview.outcome + "." : "Watch in progress.")
        + " Includes the complete journal.";
      this.#panel.hidden = false;
      this.#status.textContent = "File checked. Review it before replacing your watch.";
      this.#panel.focus();
    } catch {
      if (generation !== this.#generation) return;
      this.#clear("This file could not be opened. Choose an unmodified watch file from this version of Longwater. Your current watch has been kept.");
    }
  }

  #replace() {
    if (!this.#preview) return;
    const day = this.#preview.day;
    try {
      this.#watch.restoreFile(this.#preview);
    } catch (error) {
      this.#clear(String(error.message || error) + " Your current watch has been kept.");
      this.#open.focus();
      return;
    }
    this.#clear("");
    try {
      this.#onRestore();
      this.#status.textContent = "Opened day " + day + " of 14 with its complete journal. "
        + (this.#watch.status.kind === "saved"
          ? "This watch is saved in this browser."
          : "Download watch to keep a copy; browser saving has not succeeded.");
    } catch {
      // Admission already succeeded. A failed display refresh cannot truthfully
      // claim that the old watch remains active or promise an unsaved reload.
      this.#status.textContent = "Opened day " + day + " of 14. The watch display could not be refreshed. "
        + (this.#watch.status.kind === "saved"
          ? "It is saved in this browser. Reload this page to resume it."
          : "It has not been saved in this browser. Download watch before reloading or closing.");
    }
    this.#open.focus();
  }

  #download() {
    let url;
    try {
      const raw = this.#watch.exportFile();
      const day = JSON.parse(raw).turns.length;
      url = URL.createObjectURL(new Blob([raw], { type: "application/json;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "Longwater-watch-day-" + day + ".json";
      document.body.append(link);
      link.click();
      link.remove();
      this.#status.textContent = "Your day " + day + " watch file is ready to save. Open it in Longwater to continue the same watch.";
    } catch {
      this.#status.textContent = "The watch file could not be created. Your current watch has been kept.";
    } finally {
      if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
}
