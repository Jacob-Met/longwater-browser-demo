# Independent practice-watch receiving

Reviewer: `estate-71826f7aa69e/coordination`. This packet accepts the frozen
Longwater practice runtime from `source-cut1`, based on
`e4e9bf82f6ebb363896559507a2fb5af07b490f5`. The actual shipped 71,368-byte
WASM remains SHA256 `76deec059601613d588f4685444d407da81b3339f7cf7bdaf1bd1a13b285dae2`.
The new controller remains `31c3839022c89aa86c761087aeb1788c2ae9315d8e297b8a2d34cda956b63b18`.

## Accepted behavior

Three independent receiving cases are complete on native Mac Node 26.3.0,
Chrome 154.0.8037.98 and the already available Playwright 1.62.1. Browser
qualification used headless Chrome, fresh isolated profiles, the real page
and shipped WASM; it does not claim physical-device or actual screen-reader use.

1. A real saved partial watch was resumed. Interleaved practice Gate/Seed/Shade,
   Restart and Gate left all live readings, selected cell, journal, save status
   and saved bytes exact, with zero storage writes. After practice closed,
   the next accepted live Shade produced the entire 1,244-byte native snapshot
   byte-identical to a separate Node WASM control receiving only the live
   history. Its SHA256 is
   `50fe7fc19bdb99c3485e871b7a52de4367129d0937552b38f0f94a842eac1d11`.
   This comparison checks a possible hidden native global or random-state effect,
   beyond an unchanged snapshot before the next live action.
2. Actual reset and practice dialogs received Tab, Enter, Space, Escape and
   live-only shortcut keys. Delivered document focus stays within the active
   modal. Practice controls do not trigger live turns or open reset review;
   close restores the entry focus and the live watch stays exact.
3. An isolated component fixture used the unchanged dialog/module and a
   forwarding real-WASM session factory. One explicitly injected constructor
   exception occurred before allocation during Restart. Accepted readings,
   selection and the original native session survived; another native turn
   proved that session remained usable. A successful restart freed it once,
   and actual same-origin navigation/pagehide freed the successor once.

The first case passed in the original execution and was not repeated.
`results/receiving-v2.json` explicitly reuses that exact receipt and records
only two newly executed cases. All seven checked source/WASM hashes remain
identical before and after each execution. No product code was changed.

## Retained receiver findings

The original receipt `results/run1-receiving.json` records one passing case
and two failed receiver assertions. Both failures remain preserved, together
with the exact initial script, criteria, stdout and stderr.

The initial focus assertion incorrectly required every Tab observation to be
a dialog element. A bounded diagnostic observed Chrome's own focus slot in
both the existing reset dialog and practice: BODY is active while
`document.hasFocus()` is false, with no background game focus. The corrected
criterion permits that browser slot and still rejects any delivered background
document focus.

The initial lifecycle receiver waited for console output during pagehide.
That output was not delivered by this Chrome/CDP route. The diagnostic observed
the actual pagehide and closed dialog through synchronous storage in a
separate same-origin test page. The corrected receiver uses that durable
telemetry and retains the pre-navigation console events separately. The
constructor exception is intentional fault injection, not a naturally
observed simulation failure.

The diagnostic and corrected script are separate artifacts. The original
passing future-live-result test was preserved without rerunning it.

## Source and other qualification boundaries

`source-review.json` contains the independently rehashed six-file cut and
exact minimal hook diffs. The controller uses a supplied initialized native
constructor, distinct practice selectors and a dialog outside the live
playfield. It holds no save/journal/live-watch reference. Whole-tide values and
complete reports use parsed native snapshots, with text rendered through DOM
textContent. Close/restart/free and the queued-close guard were source-reviewed.

The author separately owns the complete fourteen tides, all three choices and
full resource/cell/report comparisons, native unavailable actions, queued-close
control, failed modal opening, phone view and deterministic offline package.
Those cases are not repeated here. Later inherited-fixture admission repairs,
full project gates and final source-tree composition remain separate receiving
boundaries.

The manifest lists sixteen selected files. The native duplicate
`results/receiving.json` is byte-identical to the published
`results/run1-receiving.json` and is omitted. Temporary browser profiles,
dependencies and caches are omitted. All test watches and inputs were authored
in fresh profiles; no user's existing watch or other browser profile was used.
