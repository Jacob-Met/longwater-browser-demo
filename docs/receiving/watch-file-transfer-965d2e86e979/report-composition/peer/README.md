# Independent Longwater file/report receiving

This packet accepts the narrow file-adoption/report composition at native commit `6483543d13e1f0dade3eca18e359d1080f05a1b6`, tree `ee897713a77123186959e89e5d43a3e7b10aaa2b`. The incoming readable-report source is canonical `e4e9bf82f6ebb363896559507a2fb5af07b490f5`, tree `1e07b279db3634a42e2ef5e7b72656529a2223c0`.

## Actual counterexample and correction

One unchanged authored browser witness opens the actual game, plays a two-tide watch, and downloads its HTML report. It selects and explicitly adopts a different valid five-tide JSON file produced by the exact native WASM simulation. A one-shot injected `SavedWatch.replayHistory` refusal then exercises the existing post-adoption display-failure boundary.

On pre-fix `0e9fd21a001527153f82b14a2183a7bf95ef2496`, the imported watch is active and saved, and its real JSON download is exact. The old report stays visible and enabled, however, and an ordinary click downloads byte-identical previous two-tide HTML. The case records 17 passing assertions plus one genuine stale-visibility failure. This is an authored failure injection, not an observed natural allocation failure.

The fixed callback adds only `document.querySelector("#watch-journal").hidden = true;` after clearing the stale game state. The same harness gives 17 passing assertions and no failures. It retains exact JSON recovery and reloads the adopted watch, whose five journal entries and actual HTML report match the opening plus all five accepted native snapshots. The baseline has one additional conditional evidence assertion because its stale download is accessible; the fixed source does not enter that branch.

Both native runs use Node 26.3.0, actual Chrome 151, fresh browser state and the project's exact local server/WASM modules. All 162 source files and modes remain unchanged. Both browser/server children close; stderr and page-error lists are empty. Raw results, process commands, HTML reports, native snapshots and JSON downloads are preserved.

## Source and artifact custody

The incoming canonical snapshot contains all 135 leaves, including the report owner's source, tests and evidence. Its nine expected R5 composition overlaps are enumerated in `source-preservation.json`; the other 126 incoming leaves are exact. The pre-fix game, save and file modules match the previously accepted R5 bytes. Removing the single corrected callback line restores the complete old game module. Removing only the new hidden-report and same-page restore assertions restores the complete previous fault-test file. No report-owner module or test was changed.

The corrected offline HTML was independently regenerated using the actual accepted packager. It equals the committed 280,929-byte artifact, SHA256 `f84055ec92204c9ebe393ee53afde322899b28abb0aa3393fc459607aa26e9ef`. This reproduction is a byte-level packaging gate; the producer's separate 92-case current suite owns full browser/offline qualification.

`source-capsule.json.gz` contains complete incoming, pre-fix and fixed snapshots with deduplicated content objects. Every file's SHA256, Git blob, length and mode is retained. The fixed snapshot was materialized into a fresh directory and its independently created Git tree equals the accepted tree exactly.

## Replay

Copy `materialize-source.cjs.source` to `materialize-source.cjs` beside the capsule, then run:

```sh
node materialize-source.cjs fixed /absolute/new/fixed-source
```

Use `prefixed` or `incoming-report` to reconstruct the other complete snapshots. The materializer refuses existing targets.

Copy `post-adoption-report-peer.mjs.source` to a runnable `.mjs` path and supply the materialized source, corresponding `fixed-receiving.json` or `prefixed-receiving.json`, and a new result directory. The harness records its own SHA256. Its explicit Playwright/Chrome paths identify the observed native Mac receiver; adapt only runtime paths on another host and record that change.

No hosted deployment, physical hardware behavior, installed service change, naturally occurring allocation refusal or broad simulation acceptance is claimed here. The root and producer retain publication, full-suite and hosted receiving separately.
