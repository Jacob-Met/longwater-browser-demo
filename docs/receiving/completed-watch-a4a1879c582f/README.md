# Longwater current three-process receiving evidence

**PASS** at Jacob-Met/longwater-browser-demo commit 9407f172518d0d6b19146e2431bcabbb2c307241, tree 213c1143ca58a170dc4d22525e5e8a6f0c62061b. The actual native/browser invocation exited 0 at 2026-10-08T19:51:14Z, using Chromium 153.0.8010.0 and Node v24.19.0.

Three distinct Chromium OS processes used one isolated persistent profile: play day 0 to 5, close fully; resume day 5 and complete day 14, close fully; reopen day 14 and verify the watch remains closed. Each process exit was verified before the next launch. Saved startup bytes, every journal entry, resource/cell transition and native snapshot matched; page errors and unexpected network requests were empty. All 22 pinned source files remained unchanged. Native packaging matched the exact current published download: 339166 bytes, Git blob 4c9b109de95b7e7bd62a9919bc2862040fc1dc6f.

## Replay using the pinned source checkout

This compact packet contains the receiving fixture and receipts, not a copy of the product runtime. Obtain a checkout of the exact commit above and verify its 22 files against SOURCE-MANIFEST.json. Set the existing runtime paths and pass that checkout explicitly:

    LONGWATER_CHROME_PATH=/absolute/path/to/chromium \
    LONGWATER_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
    node receiver.mjs /absolute/path/to/pinned-checkout /absolute/path/to/new-results

The fixture builds the offline HTML through the untouched native packager, asserts the published artifact hash, runs only the three-process workflow, and removes its isolated profile. New receipts and a screenshot go to the chosen output directory. No runtime installation or source changes are required.

## Evidence and limits

results/receipt.json is the unchanged raw current evidence, including all native control states. RUN-RECEIPT.json retains the actual exit and output. VALIDATION.json and SOURCE-MANIFEST.json pin the source checks. ADAPTATION.diff exposes every fixture change from the historical receiver. COVERAGE-DECISION.json preserves the inspected current receiving/ownership basis.

The unchanged historical/receipt.json is for b4c3b82. Its first workflow passed, but its separate BFCache prerequisite failed and the original overall exit was 1. BFCache was not retried and is not established here. This one synthetic watch is not a proof across all browser/save failures.

PRESERVATION-DISPOSITION.json records the full-packet upload failure. OUTER-RECEIPT.json describes that original verified but unsaved full archive, not this compact ZIP. Its original screenshot is unavailable. The original current raw receipt, source hashes and actual PASS remain preserved here. No successful remote-file save is claimed. Product/save/engine/rewind/Undo ownership remains unchanged; no GitHub writes were made by this receiver.
