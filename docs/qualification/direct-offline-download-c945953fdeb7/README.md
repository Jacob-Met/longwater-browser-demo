# Direct offline download receiving — 8 October 2026

This contribution lets a Longwater visitor download the complete existing game
from the live page, then play the saved HTML offline. It starts a separate watch.
The existing save status still determines whether reopening the same file in the
same browser restores that watch and its complete journal.

Source owner: `estate-c945953fdeb7/product_delivery`.
[Claim #11](https://github.com/Jacob-Met/longwater-browser-demo/issues/11).
Original semantic/save/journal/offline source ownership remains recorded in
[#5's completion](https://github.com/Jacob-Met/longwater-browser-demo/issues/5#issuecomment-6057357629)
and merged #8/#9.

## Exact source and result

| Subject | Identity or result |
| --- | --- |
| Canonical base | `b4c3b82e61c654d27c592c17ee161fd404602150` |
| Base tree | `5123f432300382718e4fc7294deddf6d30acd0a5` |
| Qualified native source | `909e47d7b49e2b491d344ec7ddb338d48cc8855e` |
| Qualified source tree | `002e73b47293637ca66f0fd2eb1f4f6df8996bab` |
| Original actual-download receiver | 1 failed, precisely on the absent native link |
| Candidate actual-download receiver | 1 passed |
| Existing packaged-file browser check | 1 passed |
| Local targeted total | 2 passed, 0 failed/skipped/cancelled |
| Runtime | Node 26.3.0, Playwright 1.62.1, Chrome 154.0.8037.98 |
| Download bytes | 203,432 |
| Download SHA-256 | `3a0c502b44a2af8f6a2718041f4cbe95c6951a68475b58b711629f370d665407` |
| Runtime-input SHA-256 | `84e449209e0fe802a181bc233aa44cf10a509d46677a2ed0571acede20bcc6cb` |

`source-manifest.json` pins all six declared source/document/artifact changes,
the exact original and candidate blobs, and all **44 unchanged parent leaves**.
Gameplay, semantic-control handling, journal and save modules, WASM/glue,
dependency pins and workflow are unchanged. The source and evidence may be
published with different Git commit metadata through the supported connector;
the exact tree and file identities bind this native qualification to that
publication. No unpublished local commit URL is claimed.

## Why the baseline failed

The original packager already produces the independently qualified 202,301-byte
standalone game. The live source contains no native download control, the
documented `dist/Longwater-Fourteen-Tides.html` output is not served, and no
release exists. The new unchanged receiver first plays a real WASM tide and
observes its journal, then fails because it finds zero download links instead
of one. The retained baseline is a delivery gap, not a simulation failure.

The original failing log and structured receipt are preserved without rewriting
their result. Baseline and candidate use the exact same receiver bytes; the
manifest checks that equality. There was no failed candidate or repaired
browser harness in this contribution.

## Actual receiving boundary

The browser activates the native download link using Enter. It saves the
browser's actual download, verifies the suggested filename, and compares its
complete bytes with a fresh existing-packager build and the checked-in artifact.
A stale generated download therefore fails the project's existing test glob.

The running online watch's readings, complete report, journal and save status
remain identical before and after downloading. The panel explicitly says the
download starts a separate watch.

A fresh browser context then opens those actual downloaded bytes through
`file://` with networking disabled. It starts at day zero, contains no online
download link, and exposes an accurate offline-copy note. The receiver plays a
real Cell 3 Gate tide, closes the page, reopens the same file, and compares the
entire native readings, report and journal. The save status reports the resumed
watch. No network or neighbouring-file request occurs.

The same run captures the 320-pixel online panel, its visible keyboard focus,
and the 1280-pixel reopened offline copy. The measured link is 207.80 by 44 CSS
pixels; the narrow page has no horizontal overflow. Both relevant panels and
the full desktop view were visually inspected. Page errors, console errors,
off-origin requests, HTTP errors and offline extra requests are empty.

The existing packaged-file case additionally retains its deterministic-build,
saved reset, full journal, native reading and selected-cell checks. Local work
deliberately did not repeat the full previously accepted 40-case suite. The
unchanged hosted workflow remains responsible for the complete project gate.

## Hosting and composition

The generated file lives at `downloads/Longwater-Fourteen-Tides.html`, alongside
the source on `longwater-demo`. The existing branch-based Pages deployment
serves that route; no workflow, hosting setting or service was changed.
`delivery-baseline.json` records the successful existing Pages run, actual
branch source and the HTTP baseline. Anonymous Pages settings returned 404;
that is recorded as API visibility, not absent hosting.

This packet establishes local HTTP download and offline-file behavior. Public
serving acceptance must follow the eventual merge and existing Pages run.

The parallel [Watch trends #10](https://github.com/Jacob-Met/longwater-browser-demo/issues/10)
was claimed after the initial repository lookup. Its modules, journal hooks and
packager inclusion stay with that source owner. The shared boundary is
[explicitly coordinated](https://github.com/Jacob-Met/longwater-browser-demo/issues/10#issuecomment-6059293442):
this contribution adds only the online-panel rewrite after `let html`; a later
runtime/module composition must regenerate the download through the maintained
packager and pass the freshness check. Neither source branch is overwritten,
and no future Watch trends acceptance is inferred.

## Replay

From this exact source with the existing test dependencies installed:

```sh
npm run package -- downloads/Longwater-Fourteen-Tides.html
LONGWATER_CHROME_PATH=/absolute/path/to/chrome \
  node --test --test-concurrency=1 tests/offline-download.test.mjs tests/package.test.mjs
```

Regenerate the committed artifact intentionally after runtime changes. The
receiver itself builds into a temporary path and never repairs a stale committed
artifact. Set `LONGWATER_DOWNLOAD_OUTPUT` to an owned output directory to retain
a separate structured receipt and screenshots. Without it, output goes under
`test-results/offline-download/`.

Qualification covers actual desktop Chrome and a narrow desktop viewport.
Physical phone and assistive-technology acceptance are not claimed. Local-file
storage remains subject to browser policy, as the product copy explains.
