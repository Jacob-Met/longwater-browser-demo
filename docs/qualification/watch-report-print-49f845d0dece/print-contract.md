# Longwater completed watch: independent browser print contract

Owner: estate-49f845d0dece/source_coordination.
This contract is frozen before receiving the final downloaded HTML or producing a PDF. It extends the independently frozen R6 contract at commit 38bb955d94bbf1032890307f7c4d04f0cb08f9be (contract SHA256 797f75ea07859c0d3f54c8943d7bbaf8e16909ca58dfe24f27db3162d017c7da).

## Inputs and scope

Use the actual complete 14-tide HTML downloaded and verified by the independent game/static-report receiving lane. Do not reconstruct HTML or execute a second game. The native expected state input must retain SHA256 2e5aef1f4269c17dc763796a6109c072c0a6a835b14f1b0012ba9bfb61670163 and its original bytes; all opening and accepted-tide snapshots originate from the native WASM simulation.
The final author source 260d00a902cb5ab6e5e7cad1a909dbd609842b1c retains runtime and offline artifact bytes from 0df34ae888c6ca9655ef93f6ca4c03fce477f3a4. Its watch-report.js SHA256 is 1d44bd246fed7b4d8e710829162f457b6edbad9f4cb9f0f23bb0a6492cf27a25.

## Browser print settings

Use the existing Chrome 154.0.8037.57 native binary with an isolated temporary profile. Print exactly one complete report to A4 portrait (210 by 297 mm), 10 mm margins, scale 1, background graphics enabled, and browser headers/footers disabled. Use Chrome Page.printToPDF after activating print media. No external report resources, additional tools, PDF synthesis, or product source mutations.

## Required output assertions

1. The extracted PDF contains the report title and closed resilient outcome, opening/final overview, opening readings, tides 1 through 14 in order, and the final 14-of-14 footer.
2. All fourteen native event titles, complete event descriptions and field-note lines are readable and retained. Whitespace introduced by PDF layout may be normalized; text identity, punctuation and values may not.
3. Each of sixteen expected tables retains its caption and all three named cell rows and five metric columns. Compare each table's ordered row values against native states: opening readings and opening-to-final plus all fourteen before-to-after tide transitions. This means 48 cell rows and 240 reading cells; numeric tokens in a global bag are insufficient.
4. Each of sixteen native resource paragraphs retains correct freshwater and seed values and transition direction.
5. At any actual table continuation across pages, column headings repeat and the remaining data rows are associated with the correct table. Rows are not broken or omitted.
6. PDF word geometry stays within the printable page area, with no clipped text or overlapping rows. Render representative first, continuation/middle and last pages for independent visual inspection.
7. Preserve exact input/source/tool hashes, actual Chrome print parameters, PDF hash, extracted text/word boxes, bounded representative images, and an honest receipt. If the chosen report does not cross a table at a page boundary, record heading repetition as unexercised rather than manufacture a second scenario.

This receiving does not repeat gameplay, download, static HTML, nonmutation, or responsiveness checks owned by recall_import_receiving. It does not add a PDF feature to the product.
