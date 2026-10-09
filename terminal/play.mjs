import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openTerminalWatch, formatTerminalReply } from "./session.mjs";

const USAGE = "Longwater: use no arguments, --json, or --help.\n";
const HELP = `Longwater — play a temporary local fourteen-tide watch.
Usage: node terminal/play.mjs [--json | --help]
Commands: state; select north; select heart; select south; gate; shade; seed;
journal; restart; keep; confirm; help; quit
Gate spends water; Shade raises canopy; Seed spends a seed pack.
Restart opens a review. Confirm starts a new watch; keep leaves it unchanged.
Progress is temporary: EOF or quit closes this watch without saving it.
--json emits complete compact replies, one per line. No browser or server is used.
`;

async function* inputLines(input) {
  const prefix = Buffer.alloc(128);
  let length = 0;
  let overflow = false;
  let hasBytes = false;
  for await (const chunk of input) {
    for (const byte of chunk) {
      if (byte === 10) {
        if (overflow) yield "x".repeat(129);
        else {
          const end = length > 0 && prefix[length - 1] === 13 ? length - 1 : length;
          yield prefix.subarray(0, end).toString("latin1");
        }
        length = 0;
        overflow = false;
        hasBytes = false;
      } else {
        hasBytes = true;
        if (length < 128 && !overflow) prefix[length++] = byte;
        else overflow = true;
      }
    }
  }
  if (hasBytes) {
    yield overflow ? "x".repeat(129) : prefix.subarray(0, length).toString("latin1");
  }
}

async function main(args) {
  // Listeners last for this CLI lifetime: a write callback can precede error delivery.
  let outputError = null;
  process.stdout.on("error", error => {
    outputError = error;
    process.exitCode = 1;
  });
  process.stderr.on("error", () => { process.exitCode = 1; });
  function write(stream, text) {
    return new Promise((accept, reject) => {
      if (stream === process.stdout && outputError) return reject(outputError);
      stream.write(text, "utf8", error => error ? reject(error) : accept());
    });
  }
  async function publish(reply, json) {
    const text = json ? JSON.stringify(reply) + "\n" : formatTerminalReply(reply);
    if (Buffer.byteLength(text, "utf8") > 131072) {
      throw new Error("Terminal reply exceeds 131072 bytes.");
    }
    await write(process.stdout, text);
  }

  if (args.length > 1 || (args.length === 1 && !["--json", "--help"].includes(args[0]))) {
    process.exitCode = 2;
    await write(process.stderr, USAGE);
    return;
  }
  if (args[0] === "--help") {
    await write(process.stdout, HELP);
    return;
  }

  const json = args[0] === "--json";
  const watch = await openTerminalWatch();
  try {
    await publish(watch.command("state"), json);
    if (process.stdin.isTTY) await write(process.stdout, "Longwater> ");
    for await (const line of inputLines(process.stdin)) {
      const reply = watch.command(line);
      await publish(reply, json);
      if (reply.closed) break;
      if (process.stdin.isTTY) await write(process.stdout, "Longwater> ");
    }
  } finally {
    watch.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    process.exitCode = 1;
    process.stderr.write("Longwater: " + String(error?.message || error) + "\n");
  });
}
