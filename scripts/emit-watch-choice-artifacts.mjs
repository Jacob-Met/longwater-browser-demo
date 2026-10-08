import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Only these existing synthetic browser-test outputs may enter the log bundle.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directory = join(root, "test-results", "watch-choice");
const names = [
  "desktop-comparison.png",
  "phone-comparison.png",
  "offline-comparison.png",
  "Longwater-choice.html",
];
const maximumFileBytes = 2 * 1024 * 1024;
const maximumTotalBytes = 2 * 1024 * 1024;
const maximumPayloadBytes = 4 * 1024 * 1024;
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const files = [];
let total = 0;
for (const name of names) {
  const filename = join(directory, name);
  const info = await lstat(filename);
  assert.ok(info.isFile() && !info.isSymbolicLink(), "Expected a regular authored fixture: " + name);
  assert.ok(info.size > 0 && info.size <= maximumFileBytes, "Authored fixture size is out of bounds: " + name);
  const bytes = await readFile(filename);
  assert.equal(bytes.length, info.size, "Authored fixture changed while being read: " + name);
  total += bytes.length;
  assert.ok(total <= maximumTotalBytes, "Authored fixture bundle exceeds 2 MiB; refusing to truncate.");
  files.push({ path: name, bytes: bytes.length, sha256: hash(bytes), base64: bytes.toString("base64") });
}
assert.equal(files.length, names.length);
const payload = Buffer.from(JSON.stringify({ version: 1, files }), "utf8");
assert.ok(payload.length <= maximumPayloadBytes, "Serialized fixture bundle exceeds 4 MiB.");
const encoded = payload.toString("base64");
const chunks = [];
for (let offset = 0; offset < encoded.length; offset += 4096) {
  chunks.push(encoded.slice(offset, offset + 4096));
}
assert.ok(chunks.length > 0 && chunks.length <= Math.ceil(maximumPayloadBytes * 4 / 3 / 4096));
console.log("LONGWATER_CHOICE_BUNDLE_BEGIN " + JSON.stringify({
  bytes: payload.length, sha256: hash(payload), chunks: chunks.length,
}));
for (let index = 0; index < chunks.length; index++) {
  console.log("LONGWATER_CHOICE_BUNDLE_CHUNK " + index + " " + chunks[index]);
}
console.log("LONGWATER_CHOICE_BUNDLE_END");
