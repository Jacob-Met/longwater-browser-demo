# Optional sound — source and native receiving

This packet supports the original issue #16 contribution to Longwater: a deliberately enabled sound switch, quiet procedural cues for accepted Gate/Shade/Seed actions, and a closing cue for the actual end of a watch. Audio never advances, restores or saves the game.

## Exact source

- Original audio source: native `0294898793e6a53ea13c21d90fc66d7f2158dc80`, tree `f02a4a419d16143ffd058929f57eaecfa106f89f`, parent `c44245f45f21ddd14c4bfbb5cf8d5a21d0e98fe3`.
- Actual landed Reset/R review: `f3215e82795d881c27f0c0225aa8ea5fcd2bbe4c`, tree `b825a333b9d7f73a73b801f517b07c256aea5934`.
- Received composition: native `e9628acd0f977e42f7a5c062223976c199c10d16`, tree `4509c5c0e35daa69aeb8bdb2d8501b6a0fcd5e3d`, with the two parents above.
- Final source plus the two required private test-server routes: native `20724ac249d1bf4b4e60e8e3dbe46dc1f419cea4`, tree `5f8d2bc71da8e5f2956f04a71456b8b35e94e5be`. All 102 unrelated current-base leaves remain exact. Every existing assertion is preserved.

The audio module, audio styles, packager and nine new maintained tests are unchanged between the original and composed qualification. The only generated-file conflict was resolved by running the normal packager over the combined inputs. Its final standalone HTML is 250,427 bytes, SHA-256 `e1c6de9ea013a36eb6e8b1af6024cd433238edc1c9a5eb22628f6842e5e9d7f6`; ordered source-input digest `2aae9f9efbb922e9b475e19bd27f2be2383e93a284058841155b93ea78e76785`.

## Recorded results

| Stage | Actual result | Qualification |
| --- | --- | --- |
| Silent c442 baseline on the Mac | Three checks passed | Real WASM opening, seven game controls and an accepted Gate/journal entry; no sound control or AudioContext. This is a new capability, not a broken baseline contract. |
| Initial nine audio groups on the Mac | Seven passed, two failed | Both failures were the receiver's `check()` postcondition requiring a deliberately blocked sound switch to stay checked. Exact original test bytes, raw log and the two activation-only corrections are retained. No production code changed. |
| Corrected maintained selection on the Mac | Incomplete after native ENOSPC | Eleven named results were recorded: eight passed and three screenshot writes failed. There is no final TAP summary or persisted child exit code; this is not a 58-case result. Exact log and later source/cleanup observations are retained. |
| Existing ThinkPad Chromium and Node | Four substantive groups passed | Forty-two accepted real WASM turns give exact complete state and saved-byte parity with sound off, on and blocked. Four audio failure modes, late-resume/mute/suspend/hidden handling, directly opened 320px offline play, and all five actual rendered cue signals are received. |
| Landed-reset composition, first receiver | Zero completed groups | An over-strict desktop width equality rejected a 1265px document inside a 1280px viewport with a vertical scrollbar. Native interaction assertions had run, but no full group is claimed. |
| Same composition, one corrected width assertion | Both route groups passed | Desktop HTTP and actual 320px file: cancel preserves state/journal/save and active sound; confirm resets without a cue; the next accepted action cues; R on the switch stays outside game shortcuts; mute preserves state and a subsequent real turn is silent. |
| Private save-browser server follow-up | Exact inverse-byte proof and native syntax check | Add only the audio JS/CSS routes to its existing allowlist. All product bytes and assertions stay unchanged. Full execution of the maintained save-browser cases remains part of the headed hosted gate. |

The full maintained suite is **pending actual headed GitHub Actions** at this packet stage. Native results are not presented as that gate. The current selection is the landed 60 cases plus the nine new audio cases.

## Audio and state boundaries

Sound starts off on every load. The browser context is created only from explicit switch activation. Turning it off, hiding the document or leaving the page closes the owned audio context; returning stays off. A generation token invalidates a delayed enable after mute, and a bounded resume timeout leaves the game playable. Turns accepted while audio is still starting are not queued. Unavailable actions, rejected native turns and attempts after the completed watch do not produce action cues.

The five signals are rendered using the actual native `OfflineAudioContext`, with finite samples, distinct PCM digests, no clipping and a silent tail after 1.2 seconds. Their measured peak magnitudes are below 0.057. Repeating a cue in the same engine produces the same PCM. This is software signal qualification; no subjective listening or physical-speaker acceptance is claimed. The visibility handler is exercised by explicit hidden-state/event injection because the earlier headless background-tab probe did not change document visibility.

No simulation/WASM/glue, save schema, journal/trends implementation, dependency, workflow or global browser preference changes are included. Browser receiving uses an owned headless process with `--mute-audio`, a short exclusive profile and no live user session. All reported browser processes, contexts, HTTP servers and owned profiles terminate.

## Replay

The maintained source test is `tests/watch-audio.test.mjs`; the repository's existing `npm test` selects it. Use the repository's declared Playwright dependency and the existing browser workflow.

The portable native transport receivers in this packet use only Node's standard library and an already available Chromium executable. They accept explicit source, output, browser and temporary-root paths:

```sh
node receivers/receive-sound-cdp.mjs --root PACKET_ROOT --source ORIGINAL_SOURCE --output FRESH_OUTPUT --temporary-root SHORT_OWN_TEMP --browser EXISTING_CHROMIUM
node receivers/receive-composed-reset-cdp.mjs --root PACKET_ROOT --source COMPOSED_SOURCE --output FRESH_OUTPUT --temporary-root SHORT_OWN_TEMP --browser EXISTING_CHROMIUM
```

The first receiver verifies `source-custody.json` (original c442 audio inputs); the second verifies `composition-custody.json` (the received e962 composition). Reconstruct those exact qualified source snapshots before replay. The final two-route fixture adaptation is recorded separately; it does not alter the received production bytes. Outputs must be fresh, and the short temporary root must not already exist.

Actual runtime paths and hashes are in the raw receipts. No installation or live restore is part of replay. The original Mac gate stopped when storage was exhausted. Later source/evidence were copied into an exclusive existing ThinkPad memory area, after capacity checks, without deleting another worker's data. Immutable Git publication is the final source/evidence custody.

## Coordination

Reset #20 is preserved in the combined source. Portable-watch #12/PR21, historical-choice #17/PR19 and readable-report #18 retain their owners and require their own eventual source composition. A historical alternate simulation is not an accepted live turn and must not trigger this audio hook. This packet does not claim those unmerged interfaces have been received.

Primary receipt paths and SHA-256 values are listed in `artifact-manifest.json`. Raw negative stages remain beside their corrections. Final peer review and hosted publication/CI disposition are appended separately, without rewriting these records.

## Independent source review

The separate [peer packet](peer-review/README.md) accepts exact final native source20724/tree5f8d, including the two fixture routes, with every unrelated landed-base byte preserved. It independently reads the source, inverse composition proofs and primary native receipt fields; it does not claim a second browser/core execution. Full headed maintained CI is still pending at this commit.

The author [artifact manifest](artifact-manifest.json) describes the55 payloads inside [the frozen archive](evidence.tar.gz), including its original README. The separate publication manifest describes this visible directory, the peer packet and native persistence receipt.
