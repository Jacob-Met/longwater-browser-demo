# Longwater practice watch

Players can try Gate, Shade and Seed in a fresh temporary watch, read the
whole tide's consequences, and return to their active watch with its state
and saved progress intact. The same controls are included in the offline game.

This packet records the prepared source and its exact earlier receiving cuts.
[Issue24](https://github.com/Jacob-Met/longwater-browser-demo/issues/24) and the
subsequent pull-request/receiving records track acceptance and deployment
of the exact published commit.

## Player behavior

**Open practice** starts at tide zero with Heart Pool selected. Practice has
its own native `BrowserSession`. Each accepted action advances one complete
tide. Before/after readings include water, seed packs and all five readings
for all three cells, followed by the event, event note and complete field notes.

The interface attributes the result to the action, tide event and dawn drift
together. It does not present an action-only effect or predict the active
watch's next tide. Actual native refusals leave the accepted readings intact.

**Restart practice** discards the practice and starts fresh. **Close practice**
or Escape releases it and restores the entry focus. Reopening begins at zero.
Practice does not access SavedWatch, browser storage, the active selection,
journal, historical comparison or file-transfer state.

## Source composition

The receiving target is historical-choice merge
`2451ec6fa29d10fa8bac53b59faf95c69fb9951c`, which already includes portable
watch transfer and full reports. [The source manifest](source-manifest.json)
binds eleven source/test/package paths and every frozen boundary.

The controller, stylesheet and six original practice cases retain their
qualified first-cut bytes. Five small shared-file additions reverse exactly
to the target. The target's failed-import historical null invalidation,
original adoption cases, workflow, saved-watch logic, history model and
simulation/glue/WASM remain intact.

The file-adoption receiver has a strict runtime input manifest. Only its
changed index/game pins and two appended practice assets are rebound;
all sixteen other entries remain exact. No assertion is weakened.
The offline package was regenerated with the unchanged target packaging
method, including historical-choice modules and the new practice input pair.

| Source or artifact | Exact identity |
| --- | --- |
| Complete source-only tree | `5a68e29154987efea415b31fac044b2c57152438` |
| Practice controller | `e68f484848d9cf334a9eb35475973ffbe8a603b5` |
| Practice stylesheet | `4a38f1d84440a23e4ee15ca2504e216bf858c4b4` |
| New historical/practice regression | `a06933246de72b545a0bfa48a50f6176d8fea4b7` |
| Unchanged 71,368-byte WASM | `faf26b8aa6a8887688249d6e3e34b3042c8babf3` |
| Final 339,166-byte offline HTML | `4c9b109de95b7e7bd62a9919bc2862040fc1dc6f` |

## Actual completed receiving

| Boundary | Actual result | Exact packet |
| --- | --- | --- |
| Initial source on e4e9 | Five syntax checks and six new cases passed. First full run passed63/72; the nine affected fixture/environment cases then passed. This is not a single72-case successful run. | [Author](native-initial/README.md) |
| Independent initial source | Three substantive cases passed across their preserved executions, including zero practice storage writes, native session lifetime and the next live native result matching a separate control byte for byte. Original receiver focus/telemetry failures and corrections remain. | [Independent](independent-initial/README.md) |
| Portable-watch composition on43038 | All98 project cases passed together in67.029s, with all43 source/runtime files unchanged; actual offline download, packaging and resume also passed. | [Author](native-transfer/README.md) |
| Independent portable-watch composition | A real file read completed while practice was open. Focus stayed in the modal, replacement remained explicit, and the next live turn after import matched a1,190-byte native control. | [Independent](independent-transfer/README.md) |
| Historical-choice composition on2451 | Native syntax, packaging,54-file custody and adoption metadata reversal passed. The later full-run launch outcome is unknown after the device went offline. | [Preparation](native-choice/README.md) |
| Independent historical/practice regression | Maintained source and primary stdin syntax passed; actual browser execution is pending at this publication boundary. | [Preparation](independent-choice/README.md) |
| Existing public baseline | Eighteen runtime inputs and the offline download returned200 with exact canonical2451 bytes, MIME types and matching package-input hash. No user watch or browser session was touched. | [Baseline](public-baseline/README.md) |

The current composed browser test set and the three unchanged historical-choice
file-adoption cases are to be received by the existing hosted project workflow.
A separate prepared public receiver will verify the final served bytes before
opening a fresh isolated browser and exercising practice. Neither pending
boundary is represented as completed here.

## Preserved failure and custody boundaries

The initial save fixture needed two asset MIME entries; its assertions were
unchanged. The inherited offline-download receiver required a truthful local
partial Git identity. Those original failures and bounded corrections remain
in the initial packet. Later target browser failure assertions are preserved
rather than reapplying that historical fixture edit.

Native Mac space pressure and metadata-path corrections are recorded by the
corresponding preparation packets. No peer data was deleted. For the final
Mac timeout no PID or receipt was recovered; no duplicate launch was attempted.
Later native/hosted receiving is separately attributed to its actual runtime
and exact commit.

All source and evidence stay within the existing repository. No simulation,
save schema, dependency, hosting, service, credential or user profile change
is part of this feature. Temporary test watches use fresh isolated contexts.
[The publication manifest](publication-manifest.json) binds every evidence
member by Git object and byte count.
