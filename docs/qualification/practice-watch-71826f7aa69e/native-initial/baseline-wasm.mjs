import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { BrowserSession, initSync } from "./pkg/longwater_web.js";
const wasm = await readFile("./pkg/longwater_web_bg.wasm");
initSync({ module: wasm });
const live = new BrowserSession();
const opening = live.snapshot_json();
const samples = [];
for (const action of ["gate", "shade", "seed"]) {
  const practice = new BrowserSession();
  try {
    const before = JSON.parse(practice.snapshot_json());
    const after = JSON.parse(practice.take_turn(action, "heart"));
    samples.push({ action, before, after, agreesWithSnapshot: JSON.parse(practice.snapshot_json()).day === after.day });
  } finally { practice.free(); }
}
const unchanged = live.snapshot_json() === opening;
live.free();
console.log(JSON.stringify({ schema: 1, purpose: "Unchanged shipped-WASM feasibility before practice source", wasmSha256: createHash("sha256").update(wasm).digest("hex"), opening: JSON.parse(opening), samples, separateLiveSessionUnchanged: unchanged }, null, 2));
