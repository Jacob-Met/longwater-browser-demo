// This optional artifact only supplies a File to the existing review path.
// It has no reference to the live watch and never accesses browser storage.
export async function initializeIncludedWatch() {
  const button = document.querySelector("#included-watch-review");
  const status = document.querySelector("#included-watch-status");
  const label = document.querySelector("#included-watch-name");
  if (!button || !status || !label) return;
  button.disabled = true;
  try {
    const payload = JSON.parse(document.querySelector("#included-watch-data").textContent);
    if (typeof payload.name !== "string" || typeof payload.watchBase64 !== "string") {
      throw new Error("Invalid included watch.");
    }
    label.textContent = payload.name;
    // The original script tag owns startup. Importing that identical URL
    // awaits its top-level await through the browser's module cache.
    const entry = document.querySelector('script[type="module"][src]');
    const moduleURL = entry?.getAttribute("src");
    if (!moduleURL) throw new Error("The original game module is unavailable.");
    await import(moduleURL);
    const input = document.querySelector("#watch-file-input");
    const open = document.querySelector("#watch-file-open");
    const startup = document.querySelector("#startup-error");
    if (!input || !open || open.disabled || !startup || !startup.hidden) {
      throw new Error("Longwater could not start.");
    }
    if (typeof File !== "function" || typeof DataTransfer !== "function") {
      status.textContent = "This browser cannot review an included watch. Your current watch has been kept; ordinary watch-file controls remain available.";
      return;
    }
    button.addEventListener("click", () => {
      try {
        const bytes = Uint8Array.from(atob(payload.watchBase64), char => char.charCodeAt(0));
        const file = new File([bytes], payload.name, { type: "application/json" });
        const transfer = new DataTransfer();
        transfer.items.add(file);
        if (transfer.files.length !== 1) throw new Error("The browser refused the selected File.");
        // Any constructor/assignment failure happens before dispatch, so it
        // cannot clear an already pending ordinary file review.
        input.files = transfer.files;
        const delivered = input.files;
        if (!delivered || delivered.length !== 1 || delivered[0] !== file) {
          throw new Error("The browser did not retain the intended File.");
        }
        input.dispatchEvent(new Event("change", { bubbles: true }));
        status.textContent = "The included watch was sent to the existing file review. Check that review before choosing Replace current watch.";
      } catch {
        status.textContent = "This browser could not send the included watch for review. Your current watch and any existing file review have been kept.";
      }
    });
    status.textContent = "The included watch is ready to review. Nothing is replaced until you confirm in the existing watch-file review.";
    button.disabled = false;
  } catch {
    status.textContent = "The included watch is unavailable because Longwater could not start or the included data could not be read. Your current watch has been kept.";
  }
}
