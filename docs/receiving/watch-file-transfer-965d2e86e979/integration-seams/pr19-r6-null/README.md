# PR19 null invalidation: bounded current-R6 receiving packet

The pending three-case file-adoption gate is accepted. The exact owner API at PR19 `d40f0b9c8b5e8e80cb11608e374dcf23fd768b18` is composed with accepted R6 and invoked immediately after the adoption callback clears stale state. Existing report hiding follows it unchanged:

```js
state = null;
historicalChoice.synchronize(null);
document.querySelector("#watch-journal").hidden = true;
```

## Immutable public baselines

- Merged R6: `43038d28b08562a5f1c143b2773d925b4d28ca7d`, complete 247-leaf tree `aaffb920e4a3a0065756c234cdeb0a8a1631f1a2`.
- Historical-choice owner: `d40f0b9c8b5e8e80cb11608e374dcf23fd768b18`, complete 114-leaf tree `8836dcd81d1b5aa5e7f85119a1cd5b50743aad26`.
- Native accepted R6 runtime: `6483543d13e1f0dade3eca18e359d1080f05a1b6`, tree `ee897713a77123186959e89e5d43a3e7b10aaa2b`.

The source trees and changed-leaf identities were independently read through the GitHub connector. The public baselines already preserve the large prior archives. This packet does not duplicate those archives or the new native full-source bundle.

## Exact reconstruction

Apply `r6-to-choice.patch` to a clean checkout of merged `43038d28`. It modifies only game/index/packager/generated HTML and adds the three exact owner historical-choice modules. `current-main-composition.json` gives the resulting complete tree and all 250 file hashes/modes.

That reconstruction was actually performed in a new native receiver. All 165 leaves from the tested composition match exactly; all 85 later R6 evidence leaves also remain unchanged. Of the 247 current baseline leaves, 243 are exact. No runtime or tests were repeated for this documentary baseline advance.

The owner module remains blob `c06835946ec99c7edd8eb16334d597356aada060`, SHA256 `984fb4150ab005785018b5f56d8eb061da8b9e977214a87c7bd93239727ec49d`. Its null branch returns before history reads or native session creation. The three original additive game/index/packager transforms reconstruct the owner's complete files on exact f321, then compose onto R6.

`null-seam-only.patch` records just the new callback call for an already-composed runtime. The complete runtime patch is a receiving handoff; the primary owner retains rebasing its additional tests, CI/documentation and final project integration.

## Actual unchanged cases

| Original coupled case | Missing catch call | Supplied null API called |
| --- | --- | --- |
| Preview/cancel keeps the active comparison | Pass | Pass |
| Successful adoption clears the previous comparison | Pass | Pass |
| Post-adoption display refusal clears the previous comparison | Fail | Pass |

The negative native source is `e630f725f05b7910446e8da1e129a60617ae8e19`, tree `c87baca24a832d99837a182564713eba138f86b5`. It includes the d40 module but omits the catch call, reproducing **2 pass / 1 fail**. The positive source is `d3a3502536e76b2c9860efe5ada73199c4a643bf`, tree `2c603b7355e27218024902961a1ee0c02753fbd5`, and passes **3/3**.

Both runs use identical adapted witness bytes. The entire original 5,402-byte three-case body, including every behavioral assertion, is byte-exact (SHA256 `10430e930088658ddb01a24ab451870490cc8e8eb390826addf28c34f09db816`). The frozen original whole witness remains under `original-witness/`.

The invertible bootstrap adapter binds current source/pins, adds only the two required report asset routes and adds strict checks that each served byte equals its frozen composed source. `fixture-adapter.json` records all eight changes and the complete inverse. It neither removes nor relaxes a behavioral assertion.

The authored one-shot replayHistory failure is deliberately injected after actual file adoption. The third case proves accepted storage and a real UI JSON download are exact before checking stale-comparison invalidation. Both runs preserve the same accepted/downloaded day-3 file SHA256 `bc32de847677b944f35989ed9225152b1a01d239617c4d7464e85d004112d48a`. The negative raw log remains byte-identical to the original reported negative.

Both commands use actual Node 26.3.0, Chrome 151 and shipped WASM. All 165 composed files and all 114 received owner files remain unchanged. Browser contexts, browser and isolated HTTP server close, with empty stderr and page-error lists.

## Custody and scope

Raw positive/negative results, exact downloaded JSON, source manifests, composition patches, fixture inputs and script sources are included. Existing large R6 archives and the native 5,207,765-byte full-source bundle remain at their original custodians. `native-custody-replay.json` records the already-completed native bundle verification; that bundle is intentionally absent from this public packet because the immutable public baselines plus patches suffice.

This receives the declared runtime integration boundary. It does not claim the owner's broad current-project suite, offline-browser behavior, hosted deployment, physical-device behavior or a naturally occurring allocation failure. No owner branch/worktree was changed, and this receiver did not publish or merge PR19.
