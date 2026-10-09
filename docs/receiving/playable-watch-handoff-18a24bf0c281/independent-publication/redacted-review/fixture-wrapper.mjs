import { readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
const sha = b => createHash("sha256").update(b).digest("hex");
const target = fileURLToPath(new URL("../watch-save.js", import.meta.url));
const before = readFileSync(target);
if (sha(before) !== "80a15bf859a2c8848bef458dfc94e21ae9924513028086539e5b6ae46aa9824c") throw new Error("Fixture watch-save preimage mismatch");
const marker = "\n// independent-publication source-custody marker; behavior unchanged\n";
appendFileSync(target, marker);
const after = readFileSync(target);
writeFileSync(new URL("../fixture-mutation.json", import.meta.url), JSON.stringify({
  fixture_only: true, pid: process.pid, parent_pid: process.ppid,
  target, before_sha256: sha(before), after_sha256: sha(after), marker,
  original_packager_sha256: sha(readFileSync(new URL("./package-original.mjs", import.meta.url))),
  order: "Parent preview succeeded before execFile entered this wrapper; unchanged ordinary packager is imported next."
}, null, 2)+"\n", {flag:"wx"});
await import("./package-original.mjs");
