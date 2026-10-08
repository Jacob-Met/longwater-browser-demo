# Deliberate new-watch review: native receiving

Producer: HAMON estate `45d4289ccf6c/production_recovery`, issue [#15](https://github.com/Jacob-Met/longwater-browser-demo/issues/15).

Reset and R now review replacement before calling the existing reset operation. Keep this watch is initially focused; Keep, Escape, and the default Enter action preserve the current native watch, selected cell, journal, and exact saved bytes. Explicit confirmation starts and saves the native opening. An observed other-tab save change dismisses an older review.

The original branch intentionally reset immediately. Its failures below are negative controls for the new requested product behavior, not evidence that the old implementation violated its previous contract.

## Source and execution

- Baseline: `c44245f45f21ddd14c4bfbb5cf8d5a21d0e98fe3`, tree `83c3d5e74377ff6403d1a531718d0674de02d9d2`.
- Native product commit: `3710126f722d7552d93dcd655a6aa400f77c7d74`, tree `e76bf9c70abd23d6a0fb494698dc8e2cd8576a6f`. The verified incremental Git bundle in the archive retains this commit and its original parent.
- Native Mac: Node 26.3.0, Playwright 1.62.1, Chromium 153.0.8010.12; actual shipped WASM, loopback HTTP and direct-open offline HTML. Existing dependencies were reused without installation.
- Final native project command: `npm test` — **60 passed, 0 failed, 0 skipped, 0 cancelled**, with all recorded source inputs exact after execution.
- Eleven new browser cases cover review/cancel, R/Escape/default Enter, explicit confirmation/reload/new play, a completed watch, narrow touch layout, modal keyboard/background controls, observed cross-tab change, unavailable storage, inert modified/held shortcuts, unchanged native turns, and the assembled offline file.
- The maintained actual-download case verifies the published offline bytes match a fresh build, then plays and reopens that actual download with no network or neighbouring-file requests.

## Preserved negative controls and receiver corrections

| Stage | Result | Interpretation |
| --- | --- | --- |
| Original receiver on original source | 2/10 pass | Reset/R still replace immediately; two healthy native controls pass. |
| Original receiver on candidate | 7/10 pass | Two screenshot markup artifacts and one native browser-chrome focus assumption fail. |
| Corrected receiver on original source | 2/10 pass | Same product negatives remain. |
| Corrected receiver on candidate | 10/10 pass | Exact state, save and journal assertions remain intact. |
| Added offline case on original source | 0/1 pass | Direct-open artifact also resets immediately. |
| First maintained full run | 57/60 pass | Three inherited R helpers still expected immediate reset. |
| Final actual npm test | 60/60 pass | All eleven new cases and the maintained suite pass. |

The screenshot-only diagnostic changes no game state and reproduces one added empty `style` attribute on `#trend-tide`. Playwright's default caret hiding causes it; `caret: "initial"` prevents it. The exact journal `innerHTML` assertions were kept. The focus diagnostic records native Tab visiting browser chrome (`BODY`, with `document.hasFocus()` false) while the dialog remains modal. The revised test allows that specific browser state and additionally requires both review buttons to be reachable and every background game control to remain unfocusable.

The final receiver adds an independent offline execution to the corrected ten cases. Their original ten-case baseline receipt remains separate; the added original offline case is received separately. No combined eleven-case baseline run is implied.

The first full-suite failures are preserved. Nine explicit confirmation calls were added across six inherited test modules. Existing assertions, invalid-save fixtures, native simulation references, and test gates are retained.

## Scope and limits

The original reset body, accepted-turn body, save implementation/schema, journal and trends implementations, WASM/glue, packager implementation, dependencies and CI workflow remain exact. The generated download is rebuilt from current inputs. This packet qualifies the isolated review on the recorded branch; it does not claim acceptance for a later watch-file, sound, historical lab, or readable-report composition. Rebuild and receive the actual combined offline source when those inputs land.

Storage-event dismissal covers observed changes. It is not a new transactional storage guarantee. Native headless Chromium was executed; no screen-reader or other-browser execution is claimed.

## Evidence

`receiving.json` provides source identity, counts, runtime and protected-file checks. `manifest.json` gives every archived member's SHA-256 and byte size. `evidence.tar.gz` holds the exact original failures, source bundle, receiver versions/adaptations, diagnostic execution, final native logs, actual-download receipt and accepted desktop/phone screenshots.

Hosted PR gates are an event dependency and must be read at the actual published head before source integration. This native packet does not predeclare hosted success.
