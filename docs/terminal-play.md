# Play Longwater in a local terminal

Use an existing Node 20 or later runtime from this repository:

```sh
node terminal/play.mjs
```

The player runs the existing committed WebAssembly game directly. It needs no
browser, server, package installation or Rust build. This is a temporary watch:
EOF or `quit` closes it without saving progress. It does not read or change the
browser's saved watch, named shelf, practice session or journal.

Heart Pool is selected initially. Type one exact command per line:

| Command | Result |
| --- | --- |
| `state` | Show the current watch. |
| `select north`, `select heart`, `select south` | Select North Bank, Heart Pool or South Reach without spending a tide. |
| `gate` | Spend one water to flush the selected cell, when the game permits it. |
| `shade` | Raise its canopy, up to three, when the game permits it. |
| `seed` | Spend one seed pack to plant life, when the game permits it. |
| `journal` | Show the opening and every accepted tide's complete report. |
| `restart` | Review starting a new watch; nothing changes yet. |
| `keep` | Cancel the open restart review and keep this watch. |
| `confirm` | Confirm the open review and start a fresh watch. |
| `help` | List commands. |
| `quit` | Close this watch. |

During restart review, read commands, `help`, `keep`, `confirm` and `quit`
remain available. Selection and actions wait for an explicit choice. Repeating
`restart` does not confirm it. The review also protects a completed watch.

Each accepted action advances one tide in the unchanged game. A selection,
invalid command or unavailable action advances none and adds no journal entry.
Fourteen accepted tides finish the watch. The simulation supplies the outcome
and unavailable-action explanation. The readings include Depth in cm, Salt in
ppt, Oxygen and Life in percent, and Canopy from zero to three. Full field notes
describe the action, tide and dawn drift; a net change does not isolate the
action's effect.

## Piped commands and JSON

```sh
printf 'select north\nseed\njournal\nquit\n' | node terminal/play.mjs
printf 'select north\nseed\nquit\n' | node terminal/play.mjs --json
node terminal/play.mjs --help
```

Human mode shows the opening and a complete reply after every command. Only a
real terminal gets a `Longwater> ` prompt. `--json` emits a compact JSON reply
followed by LF, including the opening, with no prompt. `--help` does not allocate
a game session or consume input. Other arguments, duplicates and extra arguments
exit with status two and no stdout.

Input uses LF framing, accepts CRLF by removing one final CR, and admits at most
128 bytes before LF, including that optional CR. Embedded CR, non-ASCII, empty
and unknown commands refuse without playing. A valid final line without LF is
processed once at EOF. An overlong line is drained through LF or EOF using a
bounded prefix, emits one refusal and permits the next line. Commands after
`quit` are ignored.

Each whole reply is prepared before writing and must fit within 131072 UTF-8
bytes. The player does not truncate notes. Input or output errors, including a
broken stdout pipe, remain failures. A write can fail after a native action:
this is not an atomic output transaction or a rollback guarantee.

## Programmatic temporary watches

```js
import { openTerminalWatch, formatTerminalReply } from "./terminal/session.mjs";

const watch = await openTerminalWatch();
try {
  console.log(formatTerminalReply(watch.command("select north")));
  console.log(formatTerminalReply(watch.command("seed")));
} finally {
  watch.close();
}
```

The no-argument factory initializes the existing WASM from local bytes and
allocates an independent native session. There is no arbitrary engine, state,
storage or pathname injection. `command(text)` is synchronous and requires a
primitive exact ASCII command. Its reply has these keys, in order:
`kind`, `selected`, `restartPending`, `closed`, `opening`, `native`,
`journal`, `message`.

The `opening` and `native` fields are exact complete strings returned by the
native game, not reserialized snapshots. `journal` is a newly detached array of
the exact successful turn strings in order, with at most fourteen entries.
Mutating a reply or its array cannot change the watch. `formatTerminalReply`
formats an admitted reply without changing it. A journal reply includes the
opening and every complete retained report.

`close()` is idempotent and frees this watch's native allocation once. `quit`
returns its final cached reply and closes it. Later commands throw
`Error("This terminal watch is closed.")`. Restart confirmation clears only this
watch's journal and restores its initial Heart Pool selection. Closing, playing
or restarting one watch does not affect another.

This terminal route does not claim physical-terminal accessibility, screen-reader
receiving, learning or strategy efficacy, installation or deployment. It adds no
new simulation rules, save format, browser behavior or hosted workflow.
