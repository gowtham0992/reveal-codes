/**
 * The entry: dispatches `record`, `baseline` and, in later tasks, `reveal`, `mcp` and `setup`.
 * `record` writes nothing to standard output or standard error and exits 0 for every input and
 * failure, including an uncaught exception and an unhandled rejection (Req 7.1 to 7.3, 7.10).
 * This is the only module that catches everything or calls `process.exit`.
 */
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
  const bail = (): void => {
    logger.fault({ event, path: null, reason: "exception" }).then(exitZero, exitZero);
  };
  setTimeout(exitZero, WATCHDOG_MS).unref();
  process.on("uncaughtException", bail);
  process.on("unhandledRejection", bail);
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
async function main(argv: readonly string[]): Promise<void> {
  const [command, ...rest] = argv;
  if (command === "record") return recordCommand(rest[0] ?? "");
  if (command === "baseline") {
    process.exit(await baselineMain());
  }
  process.stderr.write("usage: provenance record <event> | baseline\n");
  process.exit(1);
}
void main(process.argv.slice(2));
