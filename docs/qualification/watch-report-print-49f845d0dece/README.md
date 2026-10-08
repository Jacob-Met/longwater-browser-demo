# Actual completed-watch browser print receiving

## Result and exact scope

The actual packaged-game download printed successfully through **Chrome 154.0.8037.57** to an **11-page A4 portrait PDF**. The final composed source produces the same report bytes, so this one PDF directly covers that output.

This packet receives the printable-report promise for Longwater issue #18. The separate game/static receiving lane owns gameplay, download, exact HTML values, responsive layout, save/replay/reset and nonmutation. No second game, replacement HTML, hand-built PDF, product source mutation, live account, external report resource, tooling installation or second paper/scenario was used here.

- [Actual browser-generated PDF](completed-report.pdf)
- [Exact downloaded report HTML](completed-report.html)
- [Native print receipt](print-receipt.json)
- [Complete native verification receipt](print-verification.json)
- [Original print expectations](print-contract.md)
- [Final-source correspondence](composition-print-correspondence.json)

## What was proved

Both positioned-word and layout text output from Poppler 26.01.0 contain the exact ordered native expectation: **9,111 nonwhitespace characters across 199 semantic units**, excluding repeated table column headings from that whole-document comparison. Only whitespace introduced by layout is ignored; punctuation, numbers, arrows, text order and all other characters must agree.

The native oracle independently supplies all accepted game states and notes. The verifier does not call the report renderer or parse the HTML to obtain expected values. It checks **14 tide headings, 14 native event titles and descriptions, 56 complete field notes, 16 resource paragraphs, 16 table captions, 48 named cell rows and 240 individual metric cells**. Each metric is also checked in its correct positioned column and table row, including opening values, opening-to-final values and every before-to-after transition. This is an ordered text and positioned table comparison, rather than a search for a bag of repeated numeric tokens.

The PDF contains **17 complete column-heading rows**. Tide 12's table starts on page 9 and continues on page 10; the remaining South Reach row follows the repeated six-column heading. Every observed table row has headings on its page and remains intact. All extracted word boxes lie within the requested printable area, allowing less than one point for Chrome's device-unit paper/margin rounding. The geometry check found no overlapping word boxes or text crossing into the next table column.

Actual rendered review pages are retained:

- [Page 1: title, outcome, final overview and opening readings](rendered-pages/page-01.png)
- [Page 9: Tide 12 table begins](rendered-pages/page-09.png)
- [Page 10: repeated headings and remaining Tide 12 row](rendered-pages/page-10.png)
- [Page 11: full final-tide notes, final table and complete footer](rendered-pages/page-11.png)

Their exact hashes and native `pdftoppm` commands are in [rendered-pages.json](rendered-pages.json). Root independently inspected actual pages 1, 9 and 10 and accepted the readable A4 tables, absence of visible clipping or overlap, and all six headings repeating cleanly across the Tide 12 split. The [independent visual review](root-visual-review.json) is bound to the exact PDF hash; full-document text and geometry checks remain separately recorded.

## Custody and composition

The pre-candidate independent R6 contract is [contract.md at 38bb955d](https://github.com/Jacob-Met/longwater-browser-demo/blob/38bb955d94bbf1032890307f7c4d04f0cb08f9be/docs/qualification/watch-report-independent-49f845d0dece/contract.md), SHA256 `797f75ea07859c0d3f54c8943d7bbaf8e16909ca58dfe24f27db3162d017c7da`. This print extension was committed before receiving the final HTML or producing the PDF: native `811646e5803e2dbc3b3fc2852c9bf5917f045c9f`, contract SHA256 `35fd034f25f2c53f8cd0b62aca5d4fd9bc29a6c4edd5a7293ab248f34e0741fd`.

| Artifact | Exact SHA256 |
| --- | --- |
| Unchanged independent native oracle | `2e5aef1f4269c17dc763796a6109c072c0a6a835b14f1b0012ba9bfb61670163` |
| Actual completed HTML, 32,114 bytes | `f9ff6f51fae8e285aadc2ffbf2fa226781814fe0782dd2a5d225dddbd2a284e7` |
| Chrome PDF, 266,728 bytes | `44a574b234c59ad0c6192436a156c80a0aa0ebe91080b87349f249630c11d92a` |
| Exact report source module | `1d44bd246fed7b4d8e710829162f457b6edbad9f4cb9f0f23bb0a6492cf27a25` |
| Ordered/positioned verifier | `a5b38694709f2d445e9b43f0b3c108f0df218be6e2be90f775c18a0bd7e0d5b9` |

The original print ran at 2026-10-08 14:13:49.115–14:13:50.809 UTC from the peer's real packaged-game download, GUID `225f8f78-4e88-4cb7-b9f3-fab9ccd6e0f3`, received from native source `260d00a902cb5ab6e5e7cad1a909dbd609842b1c`, tree `e0e9091f1473fde33efd44a24df955cad30db9a9`. Its production/report bytes equal `0df34ae888c6ca9655ef93f6ca4c03fce477f3a4`.

The peer subsequently exercised composed source `a8030e23c6bef1fc4e7220150a72ae0273053f3e`, tree `8db39a069c3c856c2c555a9ca6f7d796ebfe9b86`, on actual main `f3215e82795d881c27f0c0225aa8ea5fcd2bbe4c`. Its reset-confirmation workflow remains peer-owned. This lane independently read the final actual completed download and both Git-pinned report modules: HTML bytes are identical and the module blob remains `f1dd8b3cedd447eac99b55075a19e603ba5bcfe7`. The [peer's unmodified correspondence receipt](peer-composition-correspondence.json) and our direct byte comparison are retained. **No second PDF was generated.**

The author then published [ready PR #22](https://github.com/Jacob-Met/longwater-browser-demo/pull/22), exact head `b00da99b0cfed7e738bf046d436cca88ceeef192`, tree `1e07b279db3634a42e2ef5e7b72656529a2223c0`, parent `f3215e82795d881c27f0c0225aa8ea5fcd2bbe4c`. This lane read the public `watch-report.js` and confirmed its full content and Git blob equal the qualified native module. [Public source correspondence](author-public-correspondence.json) records that readback. Root owns complete branch preservation, hosted gates and final expected-head integration.

## Native execution and limits

The thin `print-completed-report.mjs` adapter uses the peer's unchanged, hash-pinned CDP helper `native-browser-reused.mjs` and an isolated temporary Chrome profile. Page JavaScript and network access were disabled; the report contains no scripts or images. The only observed page request was the local exact HTML file. Print media was active, table minimum width was zero, and table headers used `table-header-group`.

The actual command was `Page.printToPDF` with 210 × 297 mm, 10 mm margins on all sides, scale 1, background graphics enabled, and browser headers/footers disabled. Chrome's native PDF metadata reports A4 at 595.92 × 841.92 points. [PDF information](pdfinfo.txt), [Poppler versions](poppler-versions.json), [extraction commands](poppler-commands.json), [layout text](completed-report.layout.txt) and [word boxes](completed-report.bbox.xhtml) retain the native outputs.

The [browser stderr log](browser/browser.stderr.log) is preserved without alteration. It includes nonfatal Crashpad `No space left on device` and DBus diagnostics under the known full home filesystem. The print adapter nevertheless exited successfully, the complete PDF was written in the owned tmpfs directory, and native extraction and content/geometry verification passed. No cleanup of another owner's files was used.

To review the retained PDF content mechanically, copy this packet to an isolated directory and run `python3 verify-printed-report.py`; its expected values come from the retained native-inputs bytes. The print adapter is an exact one-shot native receiving record with source/path/hash guards, not a new product tool. Original input and output files remain frozen.

This proves the recorded one-report, one-paper, one-browser print boundary. It makes no claim about other paper sizes, printers or browser engines.
