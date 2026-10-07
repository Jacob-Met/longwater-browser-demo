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
- `pkg/` — prebuilt WebAssembly simulation plus its `wasm-bindgen` JS glue
  (`longwater_web.js`, `longwater_web.d.ts`) and the `.wasm` binary. The
  canvas talks to the sim through `BrowserSession`
  (`snapshot_json` / `take_turn` / `restart`).
- `screenshots/` — desktop and phone captures
- `.nojekyll` — GitHub Pages serves the site as-is from this branch

## License

No license file is present yet.
