# Practice watch: integrated and publicly received

PR #30 integrated the practice watch as `9407f172518d0d6b19146e2431bcabbb2c307241`, delivered at https://jacobmetoyer.com/longwater-browser-demo/. Its tree, `213c1143ca58a170dc4d22525e5e8a6f0c62061b`, exactly matches the accepted source and hosted PR checkout. Root and an independent receiver verified all 107 contributed paths and all 249 unrelated target leaves.

## Actual receiving boundaries

| Receiving | Actual source boundary | Result |
|---|---|---|
| Hosted PR run 37820101652 | Synthetic merge `bbeb29f37bd2609fa987175cbc34292ce9f32ccb`, same accepted tree | All 119 project tests and three original adoption witnesses pass |
| Native ThinkPad | All 55 staged inputs bind published head `e4c8f9327349d2207def24903f40858329abac31` | All 119 project tests, three original witnesses and artifact emitter pass; source unchanged |
| Hosted postmerge run 37826926958 | Actual merged commit `9407f172518d0d6b19146e2431bcabbb2c307241` | All 119 project tests and three original witnesses pass |

The hosted PR run used Node 22.23.3, locked Playwright 1.62.1 and Chrome 151.0.7922.34. The independent native run used Node 22.22.1, installed Playwright 1.64.0 and Chromium 153.0.8010.47. Its local partial commit, `1f3f0e1810e05fd3fbffa35dd7713aabf0f3ff05`, is distinct from the published source. The new maintained historical/practice regression passed in both environments.

The existing branch-based Pages run 37826925668 built and deployed the actual merged commit. The independently reviewed public receiver ran once, from 18:49:00 to 18:49:25 UTC. All 21 public files matched exact source bytes and MIME before browser launch; all 20 loaded runtime inputs matched again in the actual browser.

One North Bank Gate practice tide matched every before/after value and the full independent native-WASM report. Close, focus recovery and fresh reopen passed. Active-watch readings, selection, journal, announcements and saved contents remained equal. Page, console and asset error lists were empty. The public storage assertion compares contents; it does not instrument transient writes. This is a bounded fresh-profile case, not a claim about every gameplay state or a phone result.

## Preserved packet

- **public/** contains the complete 17-file public, deployment and postmerge packet plus its original manifest, including both current PNGs and full logs.
- **native/** contains the original 63-payload packet in `longwater-practice-thinkpad.tar.gz`, with its manifest as the 64th archive member. Every archive member and all 55 source pins were rechecked. Selected source, receiving, project and witness records, plus the current practice-result PNG, are duplicated here for direct reading. The archive retains the complete 2,639,504-byte emitter stdout.
- **hosted/** contains both full PR logs plus original source-collection metadata. The collection also describes engine logs preserved separately in hamon-engine; those entries are collection metadata rather than additional files in this directory.
- **integration.json** binds the actual merge, complete tree preservation and root receiving assertions. The local manifest records every payload in this directory.

Earlier qualification remains unchanged. The initial 63/72 run and nine-case affected rerun remain separate; the later portable-watch cut passed 98 together. The final Mac launch outcome remains unknown after the device disconnected, and was not repeated. Those historical boundaries are not relabelled by the newer successful runs.

This receiving branch changes documentation and evidence only. It does not alter the integrated product source or deployment settings.
