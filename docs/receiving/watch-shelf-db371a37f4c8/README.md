# Named watch shelf — author qualification

Owner: `estate-db371a37f4c8`. Original author: `product_discovery`; recovery and completion: `longwater_author_recovery`. Claim: [issue 31](https://github.com/Jacob-Met/longwater-browser-demo/issues/31). Central coordination: comment 6067669412; file-owner coexistence: comment 6067671820.

## Player outcome

The Watch shelf keeps deliberately named copies of active or completed Longwater watches in this browser. Players can keep up to twelve entries, distinguish duplicate names by stable identity, rename one entry, review removal, and choose one watch for the existing file review and explicit **Replace current watch** action. Each readable entry shows the day, selected cell and completion outcome obtained through the unchanged native replay boundary.

The shelf has its own storage key, `longwater.shelf.v1`, and a 256 KiB aggregate UTF-8 limit. Native watch strings are retained exactly and remain bounded at 32 KiB each. Names are literal text, trimmed, limited to sixty Unicode code points, and reject control characters. The shelf refuses unreadable envelopes, unavailable or unconfirmed storage, stale observations, and changes detected during the asynchronous file-review path. Rename and removal operate on stable entry identity. Removal requires a current review. Shelf operations preserve the live watch, its primary automatic save, journal, historical comparison and practice state.

Opening or cancelling the shelf leaves an existing pending manual file review intact. Choosing an entry deliberately starts a new review through the existing WatchFile reader and native preview. The optional source-current guard runs after file reading and immediately before adoption. The existing accepted-file display and failure-recovery body remains exact.

## Source and scope

The canonical starting commit is `9407f172518d0d6b19146e2431bcabbb2c307241`, tree `213c1143ca58a170dc4d22525e5e8a6f0c62061b`, with 356 leaves. Its actual tree contains no AGENTS.md or CODEOWNERS. The later inspected canonical commit `7fd2bca0d0092c81f7cec547683aaf8cfb93a1c9`, tree `f8fca7f673e3bc71353a21999e8c5f16a5ddb7cd`, adds eleven completed-watch receiving documents and leaves all product inputs exact. Those documents are preserved by normal current-parent publication.

The native checkout is a complete 62-file runtime/test/delivery closure, including two exact canonical adoption-witness documents. Eight existing paths receive bounded additions or regenerated content, five product/test files are added, and 49 other native input files stay exact. The full repository tree is preserved separately through canonical Git trees. The 62-file native closure is identified explicitly throughout the receipts.

| Item | Exact identity |
| --- | --- |
| Pre-candidate author contract | SHA256 `07f53a05073009bd91240310c903d66a629b98b88ff4dbe08117c982b8ac9f34` |
| Native candidate R1/R2 commit | `708f370cbf246ea492c1d63c086f4ebfb1f7c34d` |
| Native candidate R1/R2 tree | `534edb2c6bc28bb6fb90e2e369771010d33a4d75` |
| Final native candidate commit | `a095b831bd81110f956657f54378081919d52fcf` |
| Final native candidate tree | `f8743950e4a7c0a40701ed0da19f45588ed059d3` |
| Shelf model | SHA256 `4b10cb120884ed3cac446816a342355cddaf219bff9717cbbed65e33fe487d4f` |
| Shelf controller | SHA256 `29a60b5d6867ce998c7b13011073a1817c108f79f1c4fa06005ff4338b361019` |
| Shelf CSS | SHA256 `ffacb377fa11d6354e796daf566fe9db6df0d91abd854fe724df420417caf825` |
| Final browser test | SHA256 `0f2c8289446f346032b0dc6e4aa0899676d4434c2769eace6860451b952d762e` |
| Offline HTML | 415,869 bytes; SHA256 `20b840e47eab4e70dffbc6cb8a5f56116a28bbb0e3354c6fd1f29bf828705a24` |
| Offline source fingerprint | `5cde1ae7d27c28e6b9abf4dd0ce8a84b09c5bda8c5018ece97fb0723f5f55bf1` |

All eighteen shared-file additions reverse exactly to the canonical bytes. SavedWatch, serialization, decoder/replay, primary save key, native Rust/glue/WASM, simulation rules, existing journal/report/trend algorithms, Reset, dependencies, workflow definitions and hosting remain outside this contribution's mutation fence. The adoption-runtime manifest adds three shelf inputs and updates only the changed existing index/game/file-controller pins; seventeen other owner input pins remain exact.

The final native commit changes only the new browser test relative to R1/R2. All 61 other files, including every product runtime input and the packaged offline HTML, remain byte-identical.

## Original-source receiving

The unchanged maintained native baseline passed 37 cases. The separately authored original-source receiver R2 passed six groups covering independently constructed native files at days 0, 2, 3 and 14, selected cells and exact state, read-only inspection preserving pending file review and primary storage, single automatic save behavior, invalid snapshot protection, and release of native sessions.

Original receiver R1 remains preserved with two passing and four failing groups. It called `snapshot()` where the shipped BrowserSession exposes `snapshot_json()`; its treatment of `replayHistory()` was also corrected to the returned array. Those were receiver changes, and all original source/native inputs remained exact.

## Author qualification

The native candidate gate passed 56 maintained cases: 37 inherited cases and nineteen new shelf cases. Six JavaScript syntax checks passed. The new native cases cover exact file strings and native-derived summaries, stable identities and duplicate names, rename and reviewed removal, Unicode and byte/count bounds, corrupted envelopes and inner watches, quota/unavailable/unconfirmed writes, observed and unobserved source changes, writes during native replay, stale review tokens and released native sessions. The deterministic packager emitted two identical offline files.

Seven distinct actual-browser groups were completed in bounded batches on installed Chromium 153.0.8010.47, with Node 22.22.1 and the unchanged locked Playwright 1.62.1 dependency:

- R1 passed five groups: exact selected adoption/download and reload; pending manual-review preservation through shelf use and cancellation; observed/unobserved shelf and primary-save changes; stale asynchronous reads; and quota/unavailable/corrupted storage.
- R1 reached its 180-second whole-batch ceiling before the final two groups had a result. Its log, source manifest, process records and captured artifacts are preserved. Its two owned processes were later confirmed absent without an extra signal.
- R2 passed the completed-watch group, including the exact outcome, fourteen journal entries and a byte-exact downloaded native watch. Its phone/keyboard group failed on a blanket assertion that the document's active element must remain inside the dialog after every Tab.
- The focused differential received the unchanged shelf, the original shipped Reset dialog and a plain native HTML dialog. All three reached BODY with `document.hasFocus() === false` at their Tab boundary while their dialogs stayed modal. Subsequent Tab returned inside. Background programmatic focus was refused, and Escape returned to the respective opener. The complete witness has SHA256 `b96a81f6a9e5ca54d18c4568f29f15e5afb52cb357df7835b0fbe685d37e2920`.
- The maintained browser test was refined only for this witnessed native focus behavior. It requires an active modal, either inside focus or BODY while the document lacks focus, and immediate return inside on the next Tab. Its other assertions remain intact. The original failing test bytes and exact adaptation diff are retained.
- R3 ran only the unfinished phone/offline group and passed. It covers native keyboard opening/keeping, a literal markup-and-emoji name, no image injection, readable 390-pixel layout with 24-pixel text, complete control geometry and touch targets, Escape focus return, explicit opening/replacement, reload and direct-open offline parity. The accepted browser batch finished 20:55:41 UTC with exit 0, source unchanged and its owned temporary profile removed.

Actual downloads are preserved as bytes. Captured desktop and phone regions were visually inspected. The native modal scrolls vertically at large text; control geometry verifies horizontal containment and the 44-pixel touch targets. These captures support their visible regions and the recorded interactions.

## Failure custody and resource handling

Two initial structured writes of the new browser test timed out during native path validation. Exact-target reconciliation first confirmed absence; an exclusive native write later created the file once and verified the bytes. No test ran from a partial file.

The replacement author first reconciled all known R1/R2 Node/Chromium PIDs, the final native commit, all 62 file pins and the actual R2 exit/log before continuing. All four prior PIDs were absent; no process was replayed or signalled. R2 artifacts were copied with source/destination byte equality before R3 ran.

The small locked dependency installation used `npm ci` with scripts, audit, funding output and browser downloads disabled. Package and lockfile bytes remained exact. Browser batches used fresh owned TMPDIR/profile namespaces and admission guards of 1 GiB free filesystem space and 2 GiB available memory. Browser binaries, other workers' profiles and processes were not modified.

## Archive and remaining integration gates

The accompanying archive carries the exact original source closure, final candidate closure, native closure Git bundle, frozen contracts and fixtures, executed receivers, source manifests, raw logs, positive and negative receipts, screenshots, actual downloads, and the witnessed receiver-only focus adaptation. Its member manifest identifies every payload by length and SHA256. Reproducible dependency/cache directories and browser profiles are excluded; their admission/dependency/process evidence is retained, and native originals remain in the owned namespace.

The current repository workflow executes the full maintained suite and the original three-case coupled historical-choice file-adoption witness against its actual hosted checkout. The witness's original case-block hash and runtime manifest are checked by the unchanged receiving adapter. Hosted results, independent peer browser receiving, current-base composition and root acceptance remain explicit integration gates at this author packet's freeze. This packet asserts qualified source and captured behavior; it does not assert a merge, deployment or live public delivery.

Native custody: `/home/jacob/snap/chromium/common/hamon-longwater-shelf-db371a37f4c8`.

## Preserved archive

[Download the complete author receiving packet](author-receiving.tar.gz).

- Archive: 2,845,020 bytes; SHA256 `75765235028fd81e7437b15ec3f6f50241f3ca361002696849c88fe51f8bb7b4`; Git blob `47de467e77a5d62f55031cd45ffe6184dd4daa86`.
- Member inventory: `MANIFEST.json`, SHA256 `98c59e4568d40a0c6d0ece5ebd05fe055e291d4ef45ab5bb969c5b4d379b6ffc`.
- 219 native payload files plus the manifest; all 220 members were re-extracted in memory and verified against the native bytes before publication.
