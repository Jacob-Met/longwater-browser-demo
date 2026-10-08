# Saved watch and journal composition

Receiving worker: `chatgpt-3e50c5ad22c5-production`, 2026-10-08 UTC.

## Player outcome

Closing and reopening Longwater now restores every completed tide's full journal,
including its accepted action, event, field notes and all three cells' readings.
The completed-watch comparison still begins at the actual opening, even when the
player returned partway through the watch. A successful new tide appends exactly
one report after the restored history; reset starts a new watch and journal.

The composed source preserves the independently authored semantic controls,
narrow-screen header, journal and bounded browser save. It adds the missing
connection between the save module's admitted action history and the journal's
native replay API. `SavedWatch.replayHistory()` produces the opening and every
successful native snapshot in a separate WASM session, checks the final snapshot
against the active watch, and frees that session. It does not change the active
watch or read/write browser storage. Startup supplies those strings to the
journal owner's `restore()` and uses `setLifetime()` for the persistence notice.

## Exact source custody

| Stage | Durable commit | Tree |
| --- | --- | --- |
| Semantic-controls base | `8a42c92a36611fc18004c5f4ca2bc91f155fe400` | `bfd15d5b96adac02ec9fb353757aecd48b05a63f` |
| Initial composition, expected missing-history failure | `212804514dbbc5ff42e6d9457f37e9a59964eb23` | `591c80068286a2a04f8d4ab64dd8883ac3de79bd` |
| Qualified product source | `addc7ebc8e8defc9df940c629806f28906f3f6e9` | `4a1a97efe9797340c17f957246a36f1ae9899d6a` |

The last two trees are byte-identical to local commits
`19a3747a2efbe4e8a641d8a9a2cc2c41ba71fe8f` and
`edc2ff176661e799e249401b4abb239f7840e517`. They were published over the existing
semantic-controls remote commit so the negative control remains reproducible.
The canonical `longwater-demo` branch was still
`b7905caa4998c48a7c2fcbb0edeb2bff587f4c33` when read for publication.

`author-inputs.json` records the initial source copies, all checked before and
after copying. The header comes from owner commit
`caeae7e7b8c7680bd800e69661fa9bc6b81f686e`; its exact received patch is included.
`late-received-inputs.json` records the journal owner's completed
`cd75c5bb1cdd64c9619c49378bf203ec9ae0815e` API and tests, plus the save owner's
native/browser tests. Final `journal.js` and `tests/journal.test.mjs` match the
owner byte-for-byte. The save browser test differs only by three additional
static-server routes for the composed modules. The save module differs from its
received source only by `replayHistory()`.

All work and tests ran in isolated receiving directories. The authors' working
trees were read but never edited. `source-and-runtime.json` records final source,
test, runtime and WASM hashes; `files.json` records the evidence payload hashes.

## Qualification

The final source passed **39 of 39 project cases**: six existing semantic-control
cases, six author journal cases, fourteen author native-save cases, eight author
browser-save cases, and five receiving composition cases. The complete output is
`final-project-tests.log`. The native and browser tests execute the shipped WASM.

The five new composition cases compare every displayed journal reading, full
report line, tide event and resource change with a separate real native session:

1. Close a six-tide watch, reopen it, retain all six reports and the selected cell,
   then append the seventh report. Reconstruction leaves the saved bytes intact.
2. Reload a completed fourteen-tide watch, retain all reports and compare the
   actual day-zero and day-fourteen readings; reset and reload remain at day zero.
3. Inject a storage quota failure, keep the current third report while storage
   stays at day two, retry explicitly, and resume all three reports.
4. Corrupt the stored native state while leaving the action history present;
   reject that save, preserve its bytes and expose no invented journal. Explicit
   reset replaces it with a valid new watch.
5. Use two real browser pages. Preserve the other tab's saved branch while the
   stale tab continues with a different unsaved report, then reload and restore
   the saved branch's actual history.

`final-composition/receipts.json` retains the native comparison inputs. The phone
capture was visually inspected: title/resources/reset remain separated, the save
notice is readable, and the expanded first report and all seven tide summaries
fit without horizontal overflow.

The unchanged independent receiver from durable review commit
`104ed56578f83c9e9171aa8078b518dfecc70a3a`, `tests/receiving.test.mjs`, also passed
**6 of 6 cases** against this composed product. It compares all semantic state
and complete reports through fourteen tides and reset, injects native failure,
checks local/composed/modified keyboard input, resizes real touch targets, measures
drawn canvas header bounds and checks null-canvas admission. Its hash and command
are recorded in `source-and-runtime.json`; the output, native transcript, measured
header bounds and viewport captures are under `final-independent*`. This run used
the unchanged receiver without its optional route-mutation modes.

## Negative control and reproduction

The initial composition called `journal.start(resumedState)`. The exact same new
resume test failed at **0 displayed entries versus 6 expected native tides**;
`before.log` retains the failure. This predates the later journal owner's guard
against starting at a nonzero day. The guard and full replay API are received in
the final source. The test source is unchanged between this negative control and
the qualified result.

From a checkout with Node and the pinned Playwright dependency installed:

```sh
# Qualified source; use Playwright's Chromium or set LONGWATER_CHROME_PATH.
git checkout addc7ebc8e8defc9df940c629806f28906f3f6e9
npm ci
npm test

# Expected failure of the original incomplete composition.
git checkout 212804514dbbc5ff42e6d9457f37e9a59964eb23
node --test --test-name-pattern='a resumed watch' tests/resume-journal.test.mjs
```

The qualification used Node 24.19.0, Playwright 1.62.1 and Chromium 153.0.8010.0
on Linux. WASM SHA-256 remains
`76deec059601613d588f4685444d407da81b3339f7cf7bdaf1bd1a13b285dae2`.

## Practical bounds

This receipt qualifies the exact joined browser source and the local storage
failure paths exercised here. It does not claim a live deployment, canonical
merge, other browser engines or cross-device persistence. The save module keeps
unsupported/corrupt data and observed other-tab changes until explicit reset.
Its read-before-write check does not make simultaneous writes transactional.
When saving is unavailable, reopening can restore the older successfully saved
watch; the visible status explains that the page should stay open until retry.
