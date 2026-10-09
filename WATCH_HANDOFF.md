# Share a playable Longwater watch

This optional handoff puts the offline game and one chosen watch into a single HTML file. The recipient opens that file, chooses **Review included watch**, reads the ordinary watch-file preview, and decides whether to **Replace current watch**. Opening the HTML alone does not adopt the included progress.

First use **Download watch** in Longwater to save the watch you want to share. From this repository, run:

```sh
node scripts/package-watch.mjs path/to/watch.json --output path/to/new-handoff.html
```

Choose a new filename in an existing directory. The command refuses an existing file or symbolic link, leaving it untouched. The input must be a regular UTF-8 watch file up to 32 KiB; symbolic links, directories, unsupported revisions and histories that fail the shipped simulation replay are refused before publication. Neither the selected watch nor the ordinary downloadable game is changed.

Send the resulting HTML. It includes its styles, JavaScript, shipped simulation and exact selected watch bytes. It requires no network, server or package installation to play. The ordinary game still decides how its current browser/file-context watch resumes and saves. The recipient can download that current watch before choosing replacement.

**Review included watch** waits for the original game to finish starting, then passes a File through its existing review control. Cancel leaves the recipient's watch intact. Replace uses the same native replay, storage admission and display-recovery behavior as **Open watch file**. A browser without the required File/DataTransfer support keeps the ordinary game and file controls available and explains that the included review is unavailable.

After replacement, the recipient can continue playing and use the ordinary **Download watch** control to carry the new progress. The originally included watch is a fixed attachment: later gameplay does not rewrite that attachment. Reopening the same HTML does not automatically restore it again.

The command prints one JSON receipt. `file`, `bytes` and `sha256` identify the final HTML; `input` identifies the selected watch by path, bytes and SHA256; `watch` reports its native day and selected cell. `game` identifies the unchanged ordinary offline package and its source hash; `controllerSha256` identifies the added included-watch controller. A private staging directory is used in the output directory, and final publication is exclusive. If ordinary private-stage removal fails after publication, the receipt retains success and reports `cleanupWarning`.

The inert payload is the JSON element `included-watch-data`, with literal `name` and `watchBase64`. Decoding `watchBase64` reproduces the selected file bytes, including its original JSON whitespace. The embedded ordinary game module remains unchanged and is initialized once. This addition does not change the saved-watch format, shelf, rewind, practice, simulation or ordinary packager.

For validation-source consistency, the command executes captured SavedWatch and simulation-glue module bytes with captured WASM. Before publishing it decodes those bindings from the actual packaged game and requires exact byte equality. Cached file-URL modules and a source change that is later restored on disk cannot substitute different validation bytes. Unsupported or ambiguous packaged bindings are refused. The receipt's `validation` object reports `watchSaveSha256`, `glueSha256` and `wasmSha256` for those executed-and-packaged bytes.

The included-watch controller also reads back the browser's assigned FileList. It dispatches the existing file-input event only when the exact intended File is present; a silent or unprovable assignment is reported as a refusal without clearing a pending manual review.
