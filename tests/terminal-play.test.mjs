import assert from "node:assert/strict";
import { after, test } from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { BrowserSession } from "../pkg/longwater_web.js";
import { openTerminalWatch, formatTerminalReply } from "../terminal/session.mjs";

const entry = fileURLToPath(new URL("../terminal/play.mjs", import.meta.url));
const closures = [];
function cli(args, input = "") {
  const r = spawnSync(process.execPath, [entry, ...args], {
    input, encoding: "utf8", timeout: 10000, maxBuffer: 2 * 1024 * 1024
  });
  closures.push({ args, pid: r.pid, status: r.status, signal: r.signal,
    error: r.error ? String(r.error) : null, stdout: r.stdout, stderr: r.stderr });
  assert.equal(r.error, undefined); assert.equal(r.signal, null);
  return r;
}
function rows(r) {
  assert.equal(r.status, 0, r.stderr); assert.equal(r.stderr, "");
  assert.ok(r.stdout.endsWith("\n"));
  return r.stdout.slice(0, -1).split("\n").map(JSON.parse);
}
async function withWatch(fn) {
  const w = await openTerminalWatch();
  try { return await fn(w); } finally { w.close(); }
}
after(() => process.stdout.write("AUTHOR_CLI_CLOSURES " + JSON.stringify(closures) + "\n"));

test("opening and selected tide are exact original game results", async () => {
  await withWatch(w => {
    const first = w.command("state"), donor = new BrowserSession();
    try {
      assert.equal(first.native, donor.snapshot_json());
      assert.deepEqual(Object.keys(first), ["kind", "selected", "restartPending", "closed",
        "opening", "native", "journal", "message"]);
      assert.equal(first.selected, "heart"); assert.equal(first.opening, first.native);
      assert.deepEqual(first.journal, []); assert.equal(first.message, null);
      const selected = w.command("select north");
      assert.equal(selected.native, first.native); assert.equal(selected.selected, "north");
      const raw = donor.take_turn("seed", "north"), result = w.command("seed");
      assert.equal(result.native, raw); assert.deepEqual(result.journal, [raw]);
      assert.equal(result.opening, first.native);
    } finally { donor.free(); }
  });
});

test("native canopy refusal keeps state and exact error", async () => {
  await withWatch(w => {
    w.command("select south");
    const donor = new BrowserSession();
    let expected;
    try {
      for (let i = 0; i < 3; i++) {
        assert.equal(w.command("shade").native, donor.take_turn("shade", "south"));
      }
      try { donor.take_turn("shade", "south"); } catch (e) { expected = String(e?.message || e); }
      const before = w.command("state"), result = w.command("shade");
      assert.equal(result.kind, "refusal"); assert.equal(result.message, expected);
      assert.equal(result.native, before.native); assert.equal(result.selected, "south");
      assert.deepEqual(result.journal, before.journal);
    } finally { donor.free(); }
  });
});

test("invalid inputs do not coerce callers or mutate state", async () => {
  await withWatch(w => {
    const before = w.command("state");
    for (const value of [null, undefined, 1, Symbol("state"),
      { toString() { throw new Error("do not coerce"); } },
      "", "STATE", " state", "state ", "state\r", "state\n", "select north\n",
      "select north\r", "shade\0", "café", "Δ", "select west", "x".repeat(128)]) {
      const r = w.command(value);
      assert.equal(r.kind, "refusal"); assert.equal(r.message, "Use an exact listed command.");
      assert.equal(r.native, before.native); assert.equal(r.selected, "heart");
      assert.deepEqual(r.journal, []);
    }
    assert.equal(w.command("x".repeat(129)).message, "Command exceeds 128 bytes.");
  });
});

test("restart review locks play and repeated restart", async () => {
  await withWatch(w => {
    w.command("select north"); w.command("seed");
    const before = w.command("state"), review = w.command("restart");
    assert.equal(review.kind, "review"); assert.equal(review.restartPending, true);
    assert.equal(review.native, before.native);
    assert.equal(w.command("restart").message, "A restart review is already open.");
    for (const text of ["select heart", "gate", "shade", "seed"]) {
      const r = w.command(text);
      assert.equal(r.message, "Choose confirm or keep before playing.");
      assert.equal(r.native, before.native); assert.equal(r.selected, "north");
      assert.deepEqual(r.journal, before.journal); assert.equal(r.restartPending, true);
    }
    assert.equal(w.command("state").message, null);
    assert.equal(w.command("journal").message, "Recorded tides: 1");
    assert.equal(w.command("help").kind, "help");
  });
});

test("keep preserves watch; confirm clears only this watch", async () => {
  await withWatch(w => {
    w.command("select south"); w.command("seed");
    const before = w.command("state");
    w.command("restart"); const kept = w.command("keep");
    assert.equal(kept.message, "Kept this watch."); assert.equal(kept.restartPending, false);
    assert.equal(kept.native, before.native); assert.equal(kept.selected, "south");
    assert.deepEqual(kept.journal, before.journal);
    w.command("restart"); const fresh = w.command("confirm"), donor = new BrowserSession();
    try { assert.equal(fresh.native, donor.snapshot_json()); } finally { donor.free(); }
    assert.equal(fresh.message, "Started a new watch."); assert.equal(fresh.selected, "heart");
    assert.equal(fresh.restartPending, false); assert.equal(fresh.opening, fresh.native);
    assert.deepEqual(fresh.journal, []);
    for (const text of ["keep", "confirm"]) {
      assert.equal(w.command(text).message, "No restart review is open.");
    }
  });
});

test("reply and journal copies are detached", async () => {
  await withWatch(w => {
    const r = w.command("seed"), raw = r.native;
    r.kind = "bad"; r.selected = "north"; r.journal[0] = "bad"; r.journal.push("bad");
    const next = w.command("journal");
    assert.equal(next.kind, "state"); assert.equal(next.selected, "heart");
    assert.equal(next.native, raw); assert.deepEqual(next.journal, [raw]);
    assert.notEqual(next.journal, w.command("journal").journal);
  });
});

test("two allocations are isolated through play, restart and close", async () => {
  const a = await openTerminalWatch(), b = await openTerminalWatch();
  try {
    const original = b.command("state");
    a.command("seed"); a.command("restart"); a.command("confirm"); a.close();
    assert.deepEqual(b.command("state"), original);
    assert.equal(b.command("seed").journal.length, 1);
  } finally { a.close(); b.close(); }
});

test("quit and repeated close free the real native session once", async () => {
  const w = await openTerminalWatch(), free = BrowserSession.prototype.free;
  let calls = 0;
  BrowserSession.prototype.free = function () { calls++; return free.call(this); };
  try {
    const before = w.command("seed"); w.command("restart"); const r = w.command("quit");
    assert.equal(r.kind, "closed"); assert.equal(r.closed, true);
    assert.equal(r.restartPending, false); assert.equal(r.native, before.native);
    assert.deepEqual(r.journal, before.journal);
    w.close(); w.close(); assert.equal(calls, 1);
    assert.throws(() => w.command("state"), { message: "This terminal watch is closed." });
  } finally { BrowserSession.prototype.free = free; }
});

test("fourteen accepted tides retain exact reports and finished refusal", async () => {
  await withWatch(w => {
    const donor = new BrowserSession(), expected = [];
    try {
      for (const cell of ["north", "heart", "south"]) {
        w.command("select " + cell);
        for (let i = 0; i < 3; i++) {
          const raw = donor.take_turn("shade", cell); expected.push(raw);
          assert.equal(w.command("shade").native, raw);
        }
      }
      w.command("select heart");
      for (let i = 0; i < 5; i++) {
        const raw = donor.take_turn("gate", "heart"); expected.push(raw);
        assert.equal(w.command("gate").native, raw);
      }
      const r = w.command("journal"), native = JSON.parse(r.native);
      assert.equal(native.day, 14); assert.equal(native.finished, true);
      assert.deepEqual(r.journal, expected);
      let message;
      try { donor.take_turn("seed", "heart"); } catch (e) { message = String(e?.message || e); }
      const refused = w.command("seed");
      assert.equal(refused.message, message); assert.equal(refused.native, r.native);
      assert.deepEqual(refused.journal, expected);
      const output = formatTerminalReply(r);
      assert.ok(output.includes(JSON.stringify(native.outcome, null, 2)));
      w.command("restart"); assert.equal(w.command("keep").native, r.native);
    } finally { donor.free(); }
  });
});

test("human format contains units and every complete native report", async () => {
  await withWatch(w => {
    w.command("seed"); w.command("shade"); const r = w.command("journal");
    const text = formatTerminalReply(r);
    for (const label of ["Selected: heart", "Depth ", " cm; Salt ", " ppt; Oxygen ",
      "%; Life ", "%; Canopy ", "Watch opening", "Recorded tide 1", "Recorded tide 2"]) {
      assert.ok(text.includes(label), label);
    }
    for (const raw of r.journal) {
      const report = JSON.parse(raw).report;
      for (const note of report.lines) assert.ok(text.includes(note));
      assert.ok(text.includes(JSON.stringify(report, null, 2)));
    }
    assert.equal(/[\x1b\x00]/.test(text), false);
  });
});

test("factory admits no arbitrary engine injection", async () => {
  await assert.rejects(openTerminalWatch({ engine: {} }), TypeError);
});

test("JSON CLI preserves exact order and quit ignores later commands", () => {
  const r = cli(["--json"], "select north\nseed\njournal\nquit\nseed\n"), out = rows(r);
  assert.equal(out.length, 5); assert.equal(out[0].selected, "heart");
  assert.equal(out[1].selected, "north"); assert.equal(out[2].journal.length, 1);
  assert.equal(out[3].message, "Recorded tides: 1"); assert.equal(out[4].closed, true);
  assert.equal(r.stdout.includes("Longwater> "), false);
  for (const line of r.stdout.trimEnd().split("\n")) {
    assert.equal(JSON.stringify(JSON.parse(line)), line);
  }
});

test("CRLF framing strips one final CR and raw bytes refuse", () => {
  const input = Buffer.concat([Buffer.from("state\r\nselect north\r\nstate\rstate\n", "latin1"),
    Buffer.from([255, 10])]);
  const out = rows(cli(["--json"], input));
  assert.equal(out.length, 5); assert.equal(out[1].kind, "state"); assert.equal(out[2].selected, "north");
  assert.equal(out[3].kind, "refusal"); assert.equal(out[4].kind, "refusal");
});

test("line bound includes final CR and drains through next LF", () => {
  const input = "x".repeat(127) + "\r\n" + "x".repeat(128) + "\r\n" +
    "x".repeat(1024 * 1024) + "\nstate\n";
  const out = rows(cli(["--json"], input));
  assert.equal(out.length, 5); assert.equal(out[1].message, "Use an exact listed command.");
  assert.equal(out[2].message, "Command exceeds 128 bytes.");
  assert.equal(out[3].message, "Command exceeds 128 bytes.");
  assert.equal(out[4].kind, "state"); assert.equal(JSON.parse(out[4].native).day, 0);
});

test("final valid EOF line executes once; final CR alone does not strip", () => {
  const selected = rows(cli(["--json"], "select south"));
  assert.equal(selected.length, 2); assert.equal(selected[1].selected, "south");
  const cr = rows(cli(["--json"], "state\r"));
  assert.equal(cr.length, 2); assert.equal(cr[1].kind, "refusal");
  assert.equal(rows(cli(["--json"], "")).length, 1);
});

test("help and strict arguments do not publish a native opening", () => {
  const help = cli(["--help"]); assert.equal(help.status, 0); assert.equal(help.stderr, "");
  assert.ok(help.stdout.includes("select north") && help.stdout.includes("temporary"));
  for (const args of [["--bad"], ["--json", "--json"], ["--help", "state"], ["state"], ["--"]]) {
    const r = cli(args);
    assert.equal(r.status, 2); assert.equal(r.stdout, "");
    assert.equal(r.stderr, "Longwater: use no arguments, --json, or --help.\n");
  }
});

test("human CLI renders full report without a piped prompt", () => {
  const r = cli([], "seed\njournal\nquit\n");
  assert.equal(r.status, 0); assert.equal(r.stderr, "");
  for (const text of ["Reseeding · Heart Pool", "Recorded tides: 1", "Watch opening", "Watch closed."]) {
    assert.ok(r.stdout.includes(text), text);
  }
  assert.equal(r.stdout.includes("Longwater> "), false);
});
