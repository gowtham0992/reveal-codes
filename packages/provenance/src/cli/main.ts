/**
 * The entry: dispatches `record`, `baseline`, `reveal`, `setup` and `mcp`.
 * `record` writes nothing to standard output or standard error and exits 0 for every input and
 * failure, including an uncaught exception and an unhandled rejection (Req 7.1 to 7.3, 7.10).
 * This is the only module that catches everything or calls `process.exit`.
 */
import { fileURLToPath } from "node:url";
import { installCrashHandlers } from "./crash.js";
import { nodeDeps } from "../io/deps.js";
import type { Logger } from "../io/deps.js";
import { baselineCommand } from "../io/baseline-cmd.js";
import { createFaultLog } from "../io/faults.js";
import { findWorkspaceRoot, parseEvent, runRecord } from "../io/recorder.js";
/** The watchdog: the Hook_Deadline of 20 s plus 2 s (Req 7.10, design One event). */
const WATCHDOG_MS = 22_000;
function exitZero(): void {
  process.exit(0);
}
async function recordCommand(name: string): Promise<void> {
  const deps = nodeDeps();
  let logger: Logger = deps.log;
  const event = parseEvent(name) ?? "unknown";
  setTimeout(exitZero, WATCHDOG_MS).unref();
  const bail = installCrashHandlers(() => logger, exitZero, event);
  try {
    await runRecord(deps, name, process.cwd(), (made) => {
      logger = made;
    });
  } catch {
    // Every failure of a hook run ends as exit 0 with one `exception` line and no output.
    bail();
    return;
  }
  exitZero();
}
async function baselineMain(): Promise<number> {
  const base = nodeDeps();
  const cwd = process.cwd();
  const root = (await findWorkspaceRoot(base, cwd, null)) ?? cwd.replace(/\\/gu, "/");
  const deps = { ...base, log: createFaultLog(base, `${root}/.kiro/provenance/errors.log`) };
  return baselineCommand(deps, root, (line) => process.stdout.write(`${line}\n`));
}
/** `reveal <args>`: a closed pipe (`| head`) ends the output without an error (Req 9.12). */
async function revealMain(args: readonly string[]): Promise<number> {
  const { revealCommand } = await import("../io/reveal-cmd.js");
  const { readColorEnv } = await import("../io/env.js");
  process.stdout.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code !== "EPIPE") throw error;
    process.exit(0);
  });
  const io = {
    cwd: process.cwd().replace(/\\/gu, "/"),
    env: readColorEnv(),
    isTTY: process.stdout.isTTY,
    out: (text: string) => process.stdout.write(`${text}\n`),
    err: (text: string) => process.stderr.write(`${text}\n`),
  };
  return revealCommand(nodeDeps(), args, io);
}
/** `mcp`: the stdio server. The SDK is loaded here only, never on the hook path. */
async function mcpMain(): Promise<void> {
  const { runMcpServer } = await import("../mcp/server.js");
  await runMcpServer(nodeDeps(), process.cwd());
}
/** `setup`: the running Bundle copies itself, found through `import.meta.url`. */
async function setupMain(args: readonly string[]): Promise<number> {
  const { setupCommand } = await import("../io/setup-cmd.js");
  const base = nodeDeps();
  const cwd = process.cwd().replace(/\\/gu, "/");
  const root = (await findWorkspaceRoot(base, cwd, null)) ?? cwd;
  const deps = { ...base, log: createFaultLog(base, `${root}/.kiro/provenance/errors.log`) };
  const io = {
    out: (line: string) => process.stdout.write(`${line}\n`),
    err: (line: string) => process.stderr.write(`${line}\n`),
  };
  return setupCommand(deps, root, fileURLToPath(import.meta.url), args, io);
}
async function main(argv: readonly string[]): Promise<void> {
  const [command, ...rest] = argv;
  if (command === "setup") {
    process.exitCode = await setupMain(rest);
    return;
  }
  if (command === "record") return recordCommand(rest[0] ?? "");
  if (command === "baseline") {
    process.exit(await baselineMain());
  }
  if (command === "reveal") {
    process.exitCode = await revealMain(rest);
    return;
  }
  if (command === "mcp") return mcpMain();
  process.stderr.write(
    "usage: provenance record <event> | baseline | reveal <file> | setup [--git-hook] | mcp\n",
  );
  process.exit(1);
}
void main(process.argv.slice(2));
