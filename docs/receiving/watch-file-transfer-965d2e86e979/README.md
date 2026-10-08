# Portable Longwater watch files — native receiving

## Delivered behavior

A player can download the active watch, including progress that browser storage could not save, then open that file in another browser or the packaged offline game. Opening validates the complete version-1 action history with the shipped WASM before displaying a preview. Only **Replace current watch** adopts it. Cancel and Escape retain the current watch; later play, selection, confirmed reset, a newer read or an observed other-tab change invalidates the relevant pending replacement.

Adoption restores the selected cell, complete journal, final outcome and all existing trend readings. If adoption succeeds but rebuilding the display fails, the message says that the new watch was opened and distinguishes saved from unsaved recovery. Gameplay is disabled while the download route remains available. It never falsely promises that the predecessor watch was retained.

The landed Reset/R review is preserved. **Keep this watch** and Escape leave a file preview intact. **Start new watch** executes the existing reset and invalidates it. No save schema, simulation, account, server, dependency, CI workflow or hosting mechanism is changed.

## Exact native source

| Stage | Native head | Tree | Purpose |
| --- | --- | --- | --- |
| R1 | `6fcbf6025f5ea78afce70db24fee97b1804ed74d` | `993a08caad66fd4a91aaebffeb6a575886f5baa4` | Initial file boundary and controls |
| R2 | `5c2548d154472caf33de32be96c515df156024e4` | `28e023525871068e4029f420814c240e1c5800e4` | Truthful post-adoption display recovery |
| R3 | `f50d5c10b4635eac26ce290457c71316201e903c` | `a6326e9d7cbaaad94b6d2b9489c4fb00d5c5cee7` | Landed offline-download composition |
| R4 | `6ecfdde764cdb8754a01efa33cea099949e31175` | `e80a51351bcf46cb13b95faa081f39bf2466722b` | Landed watch-trends composition |
| R5 | `a20308625b823a8947c20fc8060a438112904e42` | `cfb8079b2abfa8defbf6d767d35e065d9ba5a8af` | Landed confirmed-reset composition |

R5 was received against canonical `f3215e82795d881c27f0c0225aa8ea5fcd2bbe4c`, tree `b825a333b9d7f73a73b801f517b07c256aea5934`. The public source commit `d1b7d5793bd758e2b213412c17f5e1d59901752e` has the exact R5 tree and ordered parents `a84a42057a06a7e003ea02720f6b06c5b5b21091` and canonical `f3215e82…`. This directory is an additive documentary commit; the publication receipt records its separate full tree.

The complete R5 source has 113 leaves. Independent receiving proves 99 incoming leaves and 92 R4 leaves are unchanged in bytes and modes. Five independent complete three-way results match the candidate. Removing the declared file panel and stylesheet recovers the entire incoming index, including its reset note and dialog. Reversing four explicit-confirmation adapters recovers the full earlier file-browser fixture, including every original assertion.

## Actual qualification

| Witness | Actual result |
| --- | --- |
| Original-source native file cases | 11 missing-feature failures, 2 existing positive controls |
| R1 native save/file cases | 27/27 pass |
| R1 maintained project plus native file cases | 53/53 pass |
| R1 authored real-browser transfer groups | 9/9 pass |
| Independent R1 actual core receiver | 6/6 pass |
| Independent R1 controller receiver | 2 pass, 1 genuine post-adoption reporting failure |
| Root R1 real-Chromium post-adoption witness | 0/1, same reporting defect |
| Identical independent controller witness on R2 | 3/3 pass |
| R2 authored real-browser transfer groups | 10/10 pass |
| R3 transfer plus actual-download/package composition | 12/12 pass |
| Full current R4 project | 73/73 pass |
| Full current R5 project | **85/85 pass, 0 failed/skipped/cancelled** |

R5 ran on actual Node 26.3.0, Playwright 1.62.1 and Chromium 151.0.7922.34 with the shipped WASM. Its full log is 20,331 bytes, SHA256 `acf2de01885c20e4acfc7e19a9bee9c1ba3b7fff6d3c2529ddc911e7c01dd3e8`. The command uses the unchanged test files through Node's native test runner with file concurrency limited to one on the receiving Mac.

The 85 cases comprise all 60 incoming cases, 13 native file cases, 11 browser transfer groups and one coupled trends group. The coupled trends case compares all 570 actual native metric values across five metrics, three cells, partial/completed watches and modular/offline delivery. It checks preview non-mutation, explicit adoption, exact stored bytes, a single retained trends view and read-only keyboard review.

Browser transfer checks cover actual downloads into another browser context, full offline-file play, completed journals, reordered/late reads, preview cancellation and reuse, malformed/oversized/unreadable files, quota failure/retry, unavailable storage access, genuine second-tab changes, narrow phone layouts and focus recovery. The R2 failure witness covers both saved and unsaved post-adoption recovery, including actual export of the adopted watch.

The independent R5 receiver performed source custody and a fresh native packager/decode, not another core or browser suite. Its exact receipt is [peer-review/receiving.json](peer-review/receiving.json). All earlier independent packets are copied unchanged inside the archive, including their initial negative evidence.

## Current downloadable game

- Artifact: `downloads/Longwater-Fourteen-Tides.html`
- Bytes: **257,470**
- SHA256: `47bdf53812ae8d0d595e9ff071fc66f55a05710cf2204777e4a7eff8f4e66aa2`
- Ordered runtime-input SHA256: `a60add18d42bf64b1bdf8b9f238315ab2834c728f689ca7d20975a04c94ef66f`
- WASM SHA256: `76deec059601613d588f4685444d407da81b3339f7cf7bdaf1bd1a13b285dae2`

The fresh independent output matches the tracked download byte-for-byte. Decoding reverses all five stylesheets, outer modules, the nested trends module inside journal, embedded WASM and complete game/HTML to the exact frozen inputs. The original download owner’s freshness test also runs in the 85-case project gate.

## Evidence and replay

[receiving.json](receiving.json) binds the actual native result, source, artifact and unchanged peer packets. [source-manifest.json](source-manifest.json) records every R5 leaf. [runtime-inputs.json](runtime-inputs.json) records the ordered artifact inputs. [manifest.json](manifest.json) records the archive and every member. [evidence.tar.gz](evidence.tar.gz) contains producer logs/receipts, all six independent packets, source manifests and patches for all five stages, the original and corrected browser witnesses, and native captures.

The source patches omit only the generated downloadable HTML; regenerate it with the maintained packager. Canonical parents and native surrogate mappings are explicit in each stage's source manifest. R2 is applied after R1; R3/R4/R5 patches apply independently to their stated canonical parents.

To repeat the current source qualification using the existing project setup:

```sh
npm ci
npx playwright install chromium
node --test --test-concurrency=1 tests/*.test.mjs
node scripts/package.mjs downloads/Longwater-Fourteen-Tides.html
```

An already installed Chromium may be selected through the project's existing `LONGWATER_CHROME_PATH`. The independent packet READMEs retain their exact original receiving instructions and harnesses. Archive extraction can be checked against the per-member hashes in `manifest.json`.

## Preserved failures, boundaries and limits

R1's genuine bug was a shared catch around admission and display refresh. A synchronous journal/replay failure after adoption reported that the old watch had been kept. R2 separates those phases; the unchanged controller witness and actual browser fault reproduce the failure then accept the correction. Prior positive runs remain scoped to their exact source.

The initial R5 ordinary three-way merge stopped on adjacent save-note wording in index.html before tests ran. Its conflict is retained. The correction preserves the incoming reset note/dialog verbatim and adds only the reviewed file panel/style, with an inverse proof. Native path-validation, capacity and image-read failures are documented as environment/transport results, separate from product qualification.

A pending historical-choice contribution from issue #17 was separately challenged in memory with the accepted R4 file source. Preview/cancel and successful adoption passed; post-adoption display failure left its predecessor comparison visible. That exact 2-pass/1-fail witness and source are retained in the integration-seam packet and handed to the primary owner in [comment6061747549](https://github.com/Jacob-Met/longwater-browser-demo/issues/17#issuecomment-6061747549). Historical-choice runtime is not included in R5, and this packet does not claim its repair.

Issues #16/#17/#18 retain sound, historical-choice and readable-report ownership. Existing owner branches/worktrees were not changed. The unchanged storage admission guard is not a transaction between simultaneous tabs. Physical-controller, physical-phone and actual screen-reader acceptance are not inferred from Chromium or its emulation. Native verification, source integration, hosted CI and public deployment are separate states; later publication/CI/deployment receipts belong on PR #21.
