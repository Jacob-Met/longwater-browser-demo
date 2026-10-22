import { SavedWatchShelf, WATCH_SHELF_KEY, MAX_SHELF_ENTRIES } from "./watch-shelf-model.js";

export class WatchShelf {
  #root;
  #open;
  #watch;
  #watchFile;
  #shelf;
  #name;
  #keep;
  #list;
  #status;
  #entryStatus;
  #rename;
  #renameId = null;
  #remove;
  #removeToken = null;

  constructor(root, open, { watch, watchFile, createSession, getStorage = () => window.localStorage }) {
    this.#root = root;
    this.#open = open;
    this.#watch = watch;
    this.#watchFile = watchFile;
    this.#shelf = new SavedWatchShelf({ createSession, getStorage });
    this.#name = root.querySelector("#shelf-name");
    this.#keep = root.querySelector("#shelf-keep");
    this.#list = root.querySelector("#shelf-list");
    this.#status = root.querySelector("#shelf-status");
    this.#entryStatus = document.querySelector("#shelf-entry-status");
    this.#rename = root.querySelector("#shelf-rename");
    this.#remove = root.querySelector("#shelf-remove-review");

    open.addEventListener("click", () => this.#show());
    root.querySelector("#shelf-close").addEventListener("click", () => this.#close());
    root.addEventListener("cancel", event => {
      event.preventDefault();
      this.#close();
    });
    root.querySelector("#shelf-refresh").addEventListener("click", () => {
      this.#clearEdit();
      this.#shelf.refresh();
      this.#render();
      this.#status.focus();
    });
    root.querySelector("#shelf-keep-form").addEventListener("submit", event => {
      event.preventDefault();
      this.#keepCurrent();
    });
    this.#rename.addEventListener("submit", event => {
      event.preventDefault();
      if (!this.#renameId) return;
      try {
        this.#shelf.rename(this.#renameId, root.querySelector("#shelf-rename-name").value);
        this.#clearEdit();
        this.#render();
        this.#status.focus();
      } catch (error) { this.#failed(error); }
    });
    root.querySelector("#shelf-rename-cancel").addEventListener("click", () => {
      this.#clearEdit();
      this.#status.textContent = "No name was changed.";
      this.#status.focus();
    });
    root.querySelector("#shelf-remove-cancel").addEventListener("click", () => {
      this.#clearEdit();
      this.#status.textContent = "No shelf entry was removed.";
      this.#status.focus();
    });
    root.querySelector("#shelf-remove-confirm").addEventListener("click", () => {
      if (!this.#removeToken) return;
      try {
        this.#shelf.remove(this.#removeToken);
        this.#clearEdit();
        this.#render();
        this.#status.focus();
      } catch (error) {
        this.#clearEdit();
        this.#failed(error);
      }
    });
    window.addEventListener("storage", event => {
      if (event.key === WATCH_SHELF_KEY || event.key === null) {
        this.#shelf.storageChanged();
        this.#clearEdit();
        this.#render();
      }
    });
    open.disabled = false;
  }

  #clearEdit() {
    this.#shelf.cancelReview(this.#removeToken);
    this.#removeToken = null;
    this.#renameId = null;
    this.#remove.hidden = true;
    this.#rename.hidden = true;
  }

  #show() {
    if (this.#root.open) return;
    this.#clearEdit();
    this.#shelf.refresh();
    this.#render();
    try {
      this.#root.showModal();
      if (!this.#name.disabled) this.#name.focus();
      else this.#root.querySelector("#shelf-refresh").focus();
    } catch {
      this.#entryStatus.textContent = "The shelf could not open. Your current watch and saved entries are unchanged.";
    }
  }

  #close() {
    this.#clearEdit();
    this.#root.close();
    this.#open.focus();
  }

  #render() {
    const state = this.#shelf.state;
    this.#status.textContent = state.message;
    this.#entryStatus.textContent = state.ready
      ? state.count + " of 12 watches on this browser's shelf."
      : state.message;
    this.#name.disabled = !state.ready || state.count >= MAX_SHELF_ENTRIES;
    this.#keep.disabled = this.#name.disabled;
    this.#root.querySelector("#shelf-capacity").textContent =
      state.count + " of 12 entries · " + Math.ceil(state.bytes / 1024) + " of 256 KB used.";
    const items = state.entries.map(entry => {
      const item = document.createElement("li");
      item.dataset.shelfId = entry.id;
      const heading = document.createElement("h3");
      heading.id = "shelf-entry-" + entry.id;
      heading.textContent = entry.name;
      const summary = document.createElement("p");
      summary.id = "shelf-summary-" + entry.id;
      summary.textContent = entry.valid
        ? "Day " + entry.day + " of 14 · " + entry.cell + " selected. "
          + (entry.finished ? "Watch complete: " + entry.outcome + "." : "Watch in progress.")
        : entry.problem;
      const actions = document.createElement("div");
      actions.className = "shelf-actions";
      const button = (label, action, disabled = false) => {
        const control = document.createElement("button");
        control.type = "button";
        control.textContent = label;
        control.disabled = !state.ready || disabled;
        control.setAttribute("aria-describedby", heading.id + " " + summary.id);
        control.addEventListener("click", action);
        actions.append(control);
      };
      button("Open watch", () => this.#openEntry(entry.id), !entry.valid);
      button("Rename", () => this.#renameEntry(entry.id));
      button("Remove from shelf", () => this.#reviewRemove(entry.id));
      item.append(heading, summary, actions);
      return item;
    });
    this.#list.replaceChildren(...items);
    this.#root.querySelector("#shelf-empty").hidden = state.count !== 0 || !state.ready;
  }

  #failed(error) {
    this.#render();
    this.#status.textContent = String(error.message || error);
    this.#status.focus();
  }

  #keepCurrent() {
    try {
      this.#shelf.keep(this.#name.value, this.#watch.exportFile());
      this.#name.value = "";
      this.#clearEdit();
      this.#render();
      this.#status.focus();
    } catch (error) { this.#failed(error); }
  }

  #openEntry(id) {
    let token;
    try {
      token = this.#shelf.reviewOpen(id);
      const file = new File([token.watch], token.name + ".json", { type: "application/json" });
      // Closing the shelf alone never changes a pending file review. The
      // explicitly selected File starts the existing review only after close.
      this.#close();
      this.#watchFile.reviewFile(file, () => this.#shelf.isCurrent(token));
    } catch (error) {
      this.#shelf.cancelReview(token);
      this.#failed(error);
    }
  }

  #renameEntry(id) {
    this.#clearEdit();
    const entry = this.#shelf.state.entries.find(item => item.id === id);
    if (!entry) return;
    this.#renameId = id;
    this.#root.querySelector("#shelf-rename-title").textContent = "Rename “" + entry.name + "”";
    const name = this.#root.querySelector("#shelf-rename-name");
    name.value = entry.name;
    this.#rename.hidden = false;
    name.focus();
    name.select();
  }

  #reviewRemove(id) {
    this.#clearEdit();
    try {
      this.#removeToken = this.#shelf.reviewRemove(id);
      this.#root.querySelector("#shelf-remove-name").textContent = "Remove “" + this.#removeToken.name + "” from this browser's shelf?";
      this.#remove.hidden = false;
      this.#root.querySelector("#shelf-remove-cancel").focus();
    } catch (error) { this.#failed(error); }
  }
}
