# Readable Longwater watch report — source qualification

Issue [#18](https://github.com/Jacob-Met/longwater-browser-demo/issues/18), producer `estate-49f845d0dece/production_evidence`.

After one accepted tide, **Download watch report** produces a static HTML snapshot of the current journal. It includes the opening, exact per-tide action/cell/event/full notes, resources and all five readings for all three cells, an opening-to-current comparison and the native outcome when complete. Partial watches show the completed tide count. The report opens without JavaScript, networking or the game and can be printed. It does not resume a watch or update after later play.

The controller copies accepted journal snapshots. Export preserves the simulation, selection, journal and saved bytes. A preparation failure leaves the watch available for an explicit retry. Dynamic strings are rendered as literal escaped text. Narrow tables scroll inside focusable regions; print styles repeat column headings across page breaks.

## Final source and gate

- Actual base: `f3215e82795d881c27f0c0225aa8ea5fcd2bbe4c` (landed Reset/R review, PR #20).
- Native composed source: `a8030e23c6bef1fc4e7220150a72ae0273053f3e`, tree `8db39a069c3c856c2c555a9ca6f7d796ebfe9b86`.
- Native full suite: **66 passed, 0 failed, 0 skipped**, 109.16 seconds.
- Runtime: Node 22.22.1, Playwright 1.62.1 and Chrome for Testing 154.0.8037.57 on ThinkPad, with isolated temporary browser data.
- Actual downloadable offline game: 262,291 bytes, SHA-256 `4a243c96843a719cea40e46174643771dcbed622bcaea8156f85561e5e797737`.
- All 100 main leaves outside the eleven owned paths remain exact. The owner’s game/reset dialog/styles and tests are retained. The packager regenerates the combined artifact from current inputs.

`source-freeze.json` binds every owned source/test path. `composed-full-suite.txt` and its JSON receipt retain the actual command, source pin, duration and results. `native-source.bundle` preserves the native implementation history, including the original Mac commit `a67b89362208507e1f9f6a61248b504b4c5387ff`; its verification record lists prerequisites.

## Preserved progression

| Exact source | Result | Disposition |
| --- | --- | --- |
| Original c44245 base | Accepted native first tide; report action absent | Missing-feature witness, not an old-contract failure. |
| Initial a67b893 | Focused report suite 6/6; full suite 45/55 | Two existing tests counted all page buttons; eight save-browser cases used a closed server map without report assets. |
| 0df34ae | Full suite 54/55 | A new test waited inside a JavaScript-disabled document and used Home for horizontal reset. |
| 260d00a | Full suite 55/55 | Host-side polling and native left/right arrow checks passed; production report bytes unchanged from 0df. |
| Composed a8030e2 | Full suite 66/66 | Retains landed Reset/R review; report test declines review, requires identical report bytes, then confirms before checking fresh collection. |

The two button fixtures now retain the exact seven gameplay controls and assert the named report control separately. The save-browser fixture adds only the report JS/CSS routes; existing state, save, keyboard, reload and offline assertions remain. Initial failures and both intermediate source pins are included.

Mac capacity exhaustion and ThinkPad /tmp quota interrupted checkpoint/evidence writes. Source was preserved and verified before moving only the author’s checkout/evidence to a separate /dev/shm directory. No product-source change was made to address storage capacity. The final source and receipts above were committed after native execution.

## Independent receiving

The separate receiving owner froze a contract before candidate inspection. The final composed browser path passed **15/15 groups**, with actual HTML downloads from both the modular game and its actual downloaded offline artifact. It compared exact native values and all notes, partial/completed identity, byte stability, reload, failure/retry, nonmutation and deliberate reset. Its only composition adapter admits the landed review/Keep/confirm sequence and retains the original assertions.

All twelve report files from the composed path are byte-identical to the accepted 260d reports. The completed report SHA-256 is `f9ff6f51fae8e285aadc2ffbf2fa226781814fe0782dd2a5d225dddbd2a284e7`.

A separate actual Chrome A4 print check produced eleven pages and retained all fourteen tides, 56 field notes, sixteen resource paragraphs, 48 cell rows and 240 values. It checked printable-area bounds and repeated column headings at a table page break. The independent browser and print owners publish their immutable packets separately and link them in the PR conversation.

Hosted CI and source integration are recorded at the actual published PR head. Native desktop Chrome and touch emulation were executed; physical devices and screen readers are outside this receipt.
