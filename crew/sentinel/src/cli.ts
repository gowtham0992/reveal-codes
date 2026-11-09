import { homedir } from "node:os";
import { nodeFiles } from "./files.js";
import { redact } from "./redact.js";
import { run } from "./run.js";
import { realSleep } from "./sleep.js";

/** Process entry: the only module that names `process`, `new Date()` and the global `fetch`. */
run(process.argv.slice(2), {
  env: process.env,
  fetch: (url, init) => fetch(url, init),
  now: () => new Date(),
  sleep: realSleep,
  homeDir: homedir(),
  files: nodeFiles,
  stdout: (text) => {
    process.stdout.write(text);
  },
  stderr: (text) => {
    process.stderr.write(text);
  },
})
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`sentinel: ${redact(message, process.env["COURTLISTENER_TOKEN"])}\n`);
    process.exitCode = 1;
  });
