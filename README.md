# Longwater: Fourteen Tides

A fourteen-tide marsh stewardship game. Keep the Longwater alive through the
changing tides.

**Play it live:** http://jacobmetoyer.com/longwater-browser-demo/

## The game

You steward a marsh through 14 tides. Three marsh cells sit under your watch,
each with live **Depth**, **Salt**, **Oxygen**, and **Life** readings plus a
reed canopy (Shade 0–3). Each tide, pick a cell and take one action:

- **Gate** — spend 1 water to flush the cell
- **Shade** — raise the reed canopy (max 3)
- **Seed** — spend 1 seed pack to plant life

Every action is resolved against the live Rust simulation compiled to
WebAssembly. Survive all fourteen tides to close the watch.

## Controls

- **Mouse / touch** — tap a cell card to select it, tap an action button to act,
  tap the reset button (top right) to start a new watch
- **Keyboard** — `1` `2` `3` select a cell, `←` `→` move selection,
  `G` gate, `H` shade, `S` seed, `R` reset

The interface is responsive (compact stacked layout under 680px), supports
HiDPI canvases, and announces game state through an ARIA live region.

## Review your watch

Open **Watch journal** below the marsh to revisit any completed tide. Each entry
keeps the action and cell accepted by the simulation, the tide event, the complete
field notes and all three cells' readings before and after that tide. These net
changes include the action, the tide and dawn drift; the full notes explain each
part. Selecting a cell or attempting an unavailable action adds no entry.

After the fourteenth tide, the journal opens with the simulation's outcome and a
comparison of the opening and final readings. Earlier tides remain expandable so
you can trace how the watch developed. Tab and Enter operate the journal, and
game shortcuts run only when a game control is focused.

Your saved tides return with the watch when you reload or come back later. The
journal restores the complete reports and the original opening readings, so its
final comparison still covers all fourteen tides. Reset starts a fresh journal.

## Resume your watch

The watch saves in this browser after a successful tide or a change of selected
cell. Return to the same site in the same browser to resume the saved day, cell
and full journal. No account or server is involved; the saved history contains
only game actions and the resulting local simulation state.

The progress message below the marsh shows whether the latest watch was saved.
If saving fails, keep the page open and use **Try saving again**. An unreadable
save or a save changed by another tab is kept while this page can continue
without saving. **Reset** starts a new watch and replaces the saved one. It also
clears the current journal.

## Screenshots

![Longwater on desktop](screenshots/desktop.png)
![Longwater on a phone](screenshots/phone.png)

## Run locally

Serve the directory with any static server — the WebAssembly module is loaded
as an ES module, so `file://` won't work:

```sh
python3 -m http.server 8000
# open http://localhost:8000/
```

## How it's built

- `index.html` / `style.css` — shell, layout, responsive rules
- `game.js` — canvas UI: rendering, layout, input, screen-reader announcements
- `journal.js` / `journal.css` — visible tide history and end-of-watch review,
  using the actual before/after WASM snapshots and reports
- `watch-save.js` / `watch-save.css` — bounded local action history and visible
  save status; the unchanged WASM validates saved state and rebuilds all journal
  snapshots when the watch resumes
- `pkg/` — prebuilt WebAssembly simulation plus its `wasm-bindgen` JS glue
  (`longwater_web.js`, `longwater_web.d.ts`) and the `.wasm` binary. The
  canvas talks to the sim through `BrowserSession`
  (`snapshot_json` / `take_turn` / `restart`).
- `screenshots/` — desktop and phone captures
- `.nojekyll` — GitHub Pages serves the site as-is from this branch

## Verify

```sh
npm ci
npm test
```

The browser tests require Playwright's Chromium or an existing Chromium executable
selected with `LONGWATER_CHROME_PATH`. They play the actual bundled WebAssembly
simulation. Journal acceptance compares its displayed reports and readings with
a separate native WASM session, completes all fourteen tides, checks reset and
unavailable actions, and captures desktop/phone views in `test-results/`.
Composition tests cover a resumed partial/completed watch, the original final
recap, failed-save retry, a corrupted native snapshot and two tabs with different
progress. The save admission check does not create a transaction between
simultaneous writes in different tabs.

### Journal integration

`WatchJournal.start(state)` accepts the day-zero native snapshot;
`record(before, after)` adds the next successful native tide. On startup,
`SavedWatch.replayHistory()` replays the already accepted action history in a
separate native session and verifies its final snapshot against the active
watch. It returns the opening `snapshot_json()` string followed by every
successful `take_turn()` string, without changing the active watch or storage.
`WatchJournal.restore(snapshots)` checks that the full sequence is in order before
rebuilding the display. Its sequence checks do not authenticate arbitrary stored
snapshots; the save module must admit the native replay first. A resumed state
alone cannot become the journal's opening. `setLifetime(message)` supplies the
visible notice about this integration's persistence behavior.

## License

No license file is present yet.
