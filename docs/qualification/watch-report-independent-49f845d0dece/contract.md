# Independent readable watch-report receiving contract

## Freeze and ownership

Receiver: **estate-49f845d0dece/recall_import_receiving**. This contract is frozen after inspecting and executing canonical base **c44245f45f21ddd14c4bfbb5cf8d5a21d0e98fe3**, tree **83c3d5e74377ff6403d1a531718d0674de02d9d2**, and before inspecting the new report candidate. The candidate author may already be implementing it; no candidate source, renderer fixture or candidate download has informed these expected values.

The beneficiary is a player keeping or sharing a readable, printable account of the current partial or completed watch outside the running game. The independent scope is issue #18's human report. The author owns the renderer/controller, narrow journal snapshot/control hooks, styles and packager wiring. Issue #12 retains resumable watch files and SavedWatch; #15 retains reset review; #16 retains sound; #17 retains the alternative-choice lab. This receiver changes no author source and makes no publication/merge decision for those features.

Current source and prior receiving were inspected at the immutable base: README.md, index.html, game.js, journal.js, watch-save.js, watch-trends.js, scripts/package.mjs, the native wasm-bindgen glue, tests/journal.test.mjs and the previously landed Watch trends composition receiver. The existing journal uses actual before/after native snapshots, accepted report.action/report.cell and full report.lines. Selected game cell and selected historical trend tide are distinct state. SavedWatch validates its bounded action history by replaying the unchanged WASM and comparing the exact final snapshot string.

## Independent real-WASM baseline

A separate Node BrowserSession produced the opening plus fourteen native snapshots. An isolated native Chrome 154.0.8037.57 game then executed the same fourteen actions through real keyboard-activated controls. Every saved native snapshot, accepted action/cell, event/note/full field notes, freshwater/seed transition and all three cells' five before/after readings matched the separate native session. The existing game has no Download watch report control after the real partial watch. This is an observed feature-absence baseline.

The native run passed at **2026-10-08 13:40:23.862–13:40:27.409 UTC** on ThinkPad Node 22.22.1. The exact native-input file SHA-256 is **2e5aef1f4269c17dc763796a6109c072c0a6a835b14f1b0012ba9bfb61670163**. The unchanged 71,368-byte WASM SHA-256 is **76deec059601613d588f4685444d407da81b3339f7cf7bdaf1bd1a13b285dae2**. The baseline receiver SHA-256 is **6d2ce3abbdc4aa03c3b1a12d8fa6b0011768076439f31f8b829e597e54e99215**; browser helper **afdb405bedd25272f21166359f60ee0047ceaf7e0b3e58f63d62feeae5acf492**.

Frozen actual action order:

| Tide | Action | Accepted cell |
|---:|---|---|
| 1 | Gate | North Bank / north |
| 2 | Shade | Heart Pool / heart |
| 3 | Seed | South Reach / south |
| 4 | Shade | North Bank / north |
| 5 | Shade | South Reach / south |
| 6 | Gate | Heart Pool / heart |
| 7 | Seed | North Bank / north |
| 8 | Shade | Heart Pool / heart |
| 9 | Seed | Heart Pool / heart |
| 10 | Shade | North Bank / north |
| 11 | Gate | South Reach / south |
| 12 | Shade | South Reach / south |
| 13 | Seed | South Reach / south |
| 14 | Gate | North Bank / north |

At the partial checkpoint, three tides are complete, the most recent accepted action is Seed/South Reach, the currently selected game cell has then been changed to North Bank, and the trend is reviewing Tide 1. The selection change is an ordinary saved game action. The subsequent historical review neither spends a tide nor writes saved-watch storage. This deliberately separates three possible sources of identity before report export.

## Frozen receiving observables

The assertions below are semantic expectations. Candidate class names, function names and table layout will be mapped only after the freeze. A candidate-specific adapter may identify its DOM or public snapshot interface; it must not redefine the expected native values.

### R1 — A bounded current-watch snapshot

The report becomes actionable only after at least one accepted tide. A day-zero journal must not export a fabricated completed tide. At the frozen day-three checkpoint, the downloaded report must visibly identify a partial watch containing exactly three completed tides, the original opening, and no final outcome presented as achieved. At fourteen completed tides it must identify the completed watch and the literal native outcome **resilient**.

The report must describe all accepted completed tides in order, irrespective of which game cell or historical trend tide is currently selected. In particular, Tide 3 belongs to Seed/South Reach, despite the game selecting North Bank and the trend reviewing Tide 1. A selected cell is not an accepted-turn identity, and a selected review tide is not the end of the recorded watch.

### R2 — Exact source values and full notes

For the opening and every accepted tide, compare the report's three cell identities and all five journal readings with the independently generated native states: Depth (cm), Salt (ppt), Oxygen (%), Life (%) and Canopy (/ 3). Compare exact freshwater and seed-pack amounts and their before/after transitions. For every completed tide, compare the accepted action/cell, native event name and note, and every complete report.lines entry in order.

The report's displayed values must come from those accepted native snapshots, rather than canvas summaries, the currently selected cell, a projected tide, rounded chart geometry or a fresh simulation run with different history. Before/after or net-change wording must retain the journal's scope: action, tide and dawn drift together. It must not assert that the entire observed change is the isolated causal effect of the action.

These concrete checkpoint values are frozen in addition to the full fifteen snapshot strings:

| State | Cell | Depth | Salt | Oxygen | Life | Canopy |
|---|---|---:|---:|---:|---:|---:|
| Opening | North Bank | 34 | 34 | 64 | 44 | 0 |
| Opening | Heart Pool | 56 | 30 | 55 | 49 | 0 |
| Opening | South Reach | 67 | 40 | 43 | 38 | 0 |
| Tide 3 | North Bank | 42 | 37 | 62 | 45 | 0 |
| Tide 3 | Heart Pool | 57 | 41 | 60 | 54 | 1 |
| Tide 3 | South Reach | 68 | 52 | 39 | 49 | 0 |
| Tide 14 | North Bank | 100 | 9 | 64 | 63 | 2 |
| Tide 14 | Heart Pool | 100 | 10 | 42 | 54 | 2 |
| Tide 14 | South Reach | 100 | 19 | 19 | 46 | 2 |

Resources are 5 freshwater / 5 seed packs at opening, 4 / 4 after Tide 3, and 1 / 1 after Tide 14. Intermediate values and full notes remain in native-inputs.json; this table does not replace them.

### R3 — Export is observational

Immediately before and after a successful report export, compare the exact saved-watch string and observed Storage mutation calls, its native snapshot/action history, selected game cell, visible state/cell readings, journal entries/open disclosures/count/recap, and trend metric/review tide. Export must not take a turn, select another cell, reset, overwrite or re-save the watch, change old journal content, or move the historical review. Report status and focus associated with activating the download may change.

The same rule applies when a real download-preparation boundary is made to fail once. The precise failure point will be chosen from the candidate's actual controller after inspection. A failed preparation must not claim a saved file or consume/change the watch, and a retry must produce a real report of the still-current snapshot. This is a bounded download-controller check, not a claim about operating-system download cancellation or disk durability.

### R4 — Stable old report, fresh new report

Download a real partial report, continue the game, and download a new completed report. The old file's bytes and semantic content must remain the three-tide watch when opened after later play. The new file must include the later accepted tides and completed outcome while preserving the exact earlier native history and original opening.

If the candidate exposes a detached journal snapshot interface, inspect its actual contract and verify that a returned snapshot does not alias later journal state. This supplements, and does not replace, the real old-file/new-file check. No report renderer output is used as the expected source of truth.

### R5 — Existing replay and reset boundaries

Reload the actual saved partial watch in the same isolated browser, then export again. The report must reconstruct the true opening plus all accepted tides from the existing verified replay, not treat the resumed day as the opening or omit prior notes. A saved completed watch must likewise retain all fourteen tides and its native outcome when reopened and exported.

After the completed report is saved, use the actual existing Reset workflow to start a new watch. Report availability must return to the day-zero boundary. Take one fresh, different accepted tide and export: no earlier watch's tides, partial status or completed outcome may remain. This tests synchronization of the new report collection at the existing start/restore/record boundaries; it does not replace the separate reset-review or save-file owners' acceptance.

### R6 — A real standalone readable file

Activate the actual Download watch report control using the keyboard and capture the browser's completed download. Verify the downloaded filename is an HTML report and retain exact bytes/hash. Open those exact bytes in a new document through file:// with JavaScript execution and networking disabled.

The report must contain readable static text and semantic tables for the required values without game controls, WASM, scripts, neighboring source files or a running game. Readability cannot depend on a serialized blob only visible to JavaScript. Inspect desktop and narrow layouts; values may reflow or use a deliberate scrollable table, but must not be silently clipped or hidden. Apply print media and create a native browser PDF to witness printable content, while checking required report sections/tables remain present and visible.

A report is a human record. It must not present itself as a resumable watch format or a playable offline game.

### R7 — Current packaged-game correspondence

The author changes the packager and published offline game. Build the frozen candidate with the native existing packager and compare the result with the candidate's committed/pinned downloads/Longwater-Fourteen-Tides.html. Check deterministic bytes from identical inputs. Use the actual modular page's offline-download link, retain those downloaded bytes, and open that game through file:// without networking.

Repeat the substantive report path from actual packaged-game actions: partial and completed native watches, actual report downloads, fresh direct-open comparison, nonmutation and replay/reset synchronization. This receives the overlap introduced by the report's embedded module/style and journal dependency. It does not claim a new offline-game or resumable-format implementation.

### R8 — Literal text and input provenance

The inspected base exposes no arbitrary player text field. Accepted actions and cell identities are fixed choices; persisted measurements are admitted only after exact native replay. Thus there is currently no player-controlled text path to fabricate for this acceptance.

Preserve literal native Unicode and HTML-significant characters in displayed source text. If candidate inspection reveals a new player-editable or otherwise untrusted text path, freeze an explicitly named extension and exercise that actual path for literal escaping. Any supplementary synthetic renderer-string test must be labeled synthetic boundary evidence; it cannot be presented as an authentic native watch or a real player-input scenario.

## Evidence discipline and limits

Preserve the exact base, candidate, browser helper and receiver revisions, original unsuccessful attempts, raw browser/command outputs, actual downloads, native expected snapshot strings, source hashes and immutable public readback. A defect goes to the author as the smallest concrete source/value witness. No author-source fix, merge or deployment is performed by this receiving lane.

The independent source/integration review remains with root. The frozen native behavioral oracle is the unchanged WASM and accepted action history. New integration or input findings may add a clearly dated contract extension; the original contract and any failing witness remain unchanged.

Coordination: issue #18 independent claim comment6061062643; author-to-save-owner coordination in #12 comment6060945297. Native work is isolated on the authorized ThinkPad, with no Mac writes or browser/profile use while that device is under disk pressure.
