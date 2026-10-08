# Longwater Watch trends — frozen receiving contract
Repository: Jacob-Met/longwater-browser-demo
Branch: longwater-demo
Base commit: b4c3b82e61c654d27c592c17ee161fd404602150
Base tree: 5123f432300382718e4fc7294deddf6d30acd0a5
Contributor: afe225d6c6be / engine_execution

## Player outcome
Compare how the three marsh cells changed during the current watch, without expanding fourteen separate reports. The view is a read-only interpretation of accepted native journal snapshots.

## Display and interaction
- Place Watch trends inside the existing journal, before the per-tide entries.
- Show one selected metric at a time: Depth (cm), Salt (ppt), Oxygen (%), Life (%), or Canopy (/ 3). Never combine different units on one axis.
- Show one series for each native cell identity and its actual name, with labels and non-color distinctions.
- Include the opening native reading at tide zero, explicitly called Opening; plot only the opening plus completed tides. No predictions or extra simulation turns.
- A persistent native metric select and tide range control operate by keyboard and pointer. The readout identifies the selected opening/tide, all three exact values, and the accepted action/cell/event where available.
- A complete semantic numeric table covers every opening/completed-tide reading for the selected metric across all three cells. Changing metric makes every supported reading accessible; the table includes units and uses proper row/column headings.
- Controls do not steal keyboard focus when a tide is accepted. Follow the latest tide while the user was viewing the latest; retain an earlier selected tide during further play.
- Empty watch: show opening readings with an explicit no-completed-tides message and no fabricated tide. A completed watch covers opening plus all fourteen tides.

## Source and lifecycle
- New watch-trends.js exports WatchTrends with constructor(root), start(state), record(before, after). The only callers are narrow hooks in WatchJournal's existing constructor/start/record.
- Inputs are the existing native snapshot_json()/take_turn() results admitted by the journal path. Retain numeric values at their native precision, original identities, units, day order, action and event; label changes as including action, tide and dawn drift.
- Own projected history is bounded to fifteen snapshots; no mutation of caller input, BrowserSession, SavedWatch, storage, or journal report/entry DOM.
- Existing reset calls start and existing validated native replay calls start/record, so the chart follows the same opening/history provenance. Preserve the journal's rejection-before-replacement behavior for invalid replay order.
- The modular and generated direct-open HTML include the same view and source. The builder adds exact module/style bytes while preserving its deterministic packaging and bundled WASM.
- Existing game.js, watch-save.js/css, WASM/glue, simulation mechanics, save schema, selected-cell behavior and journal report semantics remain outside this source scope.

## Qualification
Pin and run actual bundled WASM; compare the view/table against a separate native session using changed action/cell sequences, including reset and resumed partial/completed histories. Check no entry from selection/rejected actions, no view-induced simulation/storage writes, five metrics and three cell identities, early and latest tide selection, exact readouts, Tab/arrows/Home/End, focus retention, 390px layout, and modular/direct-file parity. Preserve original missing-view evidence and inherited suite results. All browser profiles and fixtures are isolated; no live site is used.

## Publication scope
New: watch-trends.js, watch-trends.css, tests/watch-trends.test.mjs, unique docs/qualification/watch-trends-afe225d6c6be/ evidence.
Narrow edits: journal.js import/construction/start/record hooks; scripts/package.mjs includes; README.md usage.
No production edit preceded this contract or the pending native source claim.
