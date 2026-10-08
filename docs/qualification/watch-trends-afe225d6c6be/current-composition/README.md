# Watch trends: current download composition

This is the final native receiving packet for the Watch trends contribution in issue10, composed with the offline-download feature merged in PR13.

## Source and scope

The tested native source commit is `ab649be8eeb9f7b98e8f9b7262058a48da42458f`, tree `21a66561fa9300053ee0b35d2e2c1049ad29fd0d`, with actual first parent `40b689bdd266d7b53690ca5d667d8916b6815eaf` (tree `cc5cdcb6d625b2bce7a820c40e890131f89ac7eb`). All65 tracked source leaves are pinned in source-freeze.json. Nine source paths differ from that parent; all56 other inherited leaves and modes are preserved, including the download owner's style, actual-download test and qualification packet.

The original author's24 qualification files in the parent directory are preserved byte-for-byte. Their48-test result and source tree `d17b78954373f1ffff0ad465deba799c372ae521` describe the historical b4c3b82-based candidate. They are not relabeled as tests of this newer composition.

The exact original patch applied cleanly to40b. The accepted online download panel, its offline-copy transformation and its own freshness test remain. The additional owned generated path is `downloads/Longwater-Fourteen-Tides.html`, authorized in issue10 comment6059903063.

## Received behavior

Watch trends shows the opening and completed tides only, bounded to15 snapshots. The five independently selectable metrics retain their units. North Bank, Heart Pool and South Reach have persistent cell identities, text labels and distinct solid/dashed/dotted lines. A native range input and keyboard-operable metric selector expose the exact selected tide, action, target cell and event. A semantic table exposes the complete observed values.

Selecting an earlier tide stays on that tide when another action is accepted. A selection at the latest tide follows the new latest observation. Reviewing the chart writes no stored game data. Refused actions append no observation; reset returns the chart to its opening state. Independently constructed saved watches at7 and14 tides restore through actual native simulation replay. Invalid journal ordering is rejected before replacing the view.

The committed download is234,591 bytes, SHA-256 `46baa81caa970435956c4ee57c1051514d9f4f9edef5820a3f901306d66f49a3`, source-input SHA-256 `054ca53bbebab69439870fb8401a6f2d2ef9af95e5298ece3b1af45c7b1c98c8`. Two fresh builds match. Its direct-file run made zero network requests and produced the exact native final state and225 history values.

## Verification and corrections

The exact current source passed the full native `npm test` suite:49 passed, zero failures/cancellations/skips/todos, including the inherited actual-download/freshness/reopen test. The independent receiver passed9/9 groups, compared14 exact native snapshot strings and225 distinct history values, and made1,725 total numeric table comparisons across views and restores. It also received keyboard/pointer focus, read-only storage, refused action, reset, saved-watch replay, atomic invalid-restore rejection, and desktop/390px geometry.

Independent inputs were frozen at11:36:07UTC before candidate exposure, SHA-256 `9d8378d140ed306354263850567cea0ff2e942e030f46148d8a6f6ef24430315`. The original wording that attempted to retain tide4 immediately after tide4 was latest conflicted with the same latest-follows rule. A preserved pre-run clarification distinguishes latest4→5 from earlier4 while latest5→6. This changed no production requirement.

The original independent harness's pointer click on an aria-disabled refused-action control was rejected by Playwright. Its preserved correction uses actual keyboard focus+Enter on the existing native button; production code did not change. The original and corrected driver, logs and results are archived.

The first current-composition full-suite attempt passed48/49: the newly inherited download test requires `git rev-parse HEAD`, and the receiving checkout initially contained the exact tree without a commit. The actual signed40b parent was reconstructed byte-for-byte and a real candidate commit was created. Source and tests remained unchanged; the final run passed49/49. Both logs are preserved.

Only source location, output directory, expected tree, and source parent/path-count metadata were repinned in the current independent driver. Its behavioral assertions and frozen native inputs are unchanged. The current desktop capture was visually inspected; the current phone capture is byte-identical to the previously inspected independent phone image.

Native receiving used Nodev24.19.0 and actual Playwright1.62.1, with the existing isolated Chromium executable. The project lock declares Playwright1.62.1; hosted CI must independently install and receive that exact dependency closure on the published head. No source dependency or lock edit was made.

## Files and provenance

- source-freeze.json: exact source, parent, source tree, all source/base leaves, changed scope, and download pins.
- independent-receiving.json, full-suite.log: exact current results.
- pre-candidate-inputs.json, composition-receiver.mjs: frozen input facts and executed independent receiving logic.
- screenshots/: actual current desktop and phone captures.
- evidence-manifest.json: native archive and bundle pins and every archive payload.
- native-evidence.tar.gz: 549,635 bytes, SHA-256 `7becddc762684cac50a9b7ab1e9ad148986b7c675b68ebb807bd0d5e202165a2`, 55 independently verified manifest payloads. Contains the complete runtime/test inputs, original and corrected receiving, raw failures, full suite log, native source bundle and captures.

The thin native source bundle is106,493 bytes, SHA-256 `536fd2303b686641727b579b5836195e6057aa4916b07606e1673985b3d27bc1`; it requires the actual40b parent and passed native `git bundle verify`. Publication may create different commit metadata while preserving the exact qualified final tree.

These are isolated synthetic native game histories and fresh local browser contexts. They do not establish physical-device or screen-reader acceptance, measured player benefit, live-site delivery or an installed runtime update. Source publication and actual-head hosted CI are subsequent gates.
