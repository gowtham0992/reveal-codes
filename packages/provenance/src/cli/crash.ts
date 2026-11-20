/**
 * The crash handlers of `provenance record` (Req 7.3, design Resolved point 19): an uncaught
 * exception or an unhandled rejection writes one `exception` line to the Fault_Log, with no text
 * of any kind, and ends the process through `exit`. Nothing is written to standard output or
 * standard error. `main.ts` installs them; a child-process test installs the same function.
 */
import type { Logger } from "../io/deps.js";
/**
 * Installs the two handlers and returns the function they call, which `main.ts` also calls for an
 * error that escapes `runRecord`. `getLogger` is read when a fault happens, because the Fault_Log
 * only exists once the Record_Directory is known. Whatever the logger does, `exit` is called.
 */
export function installCrashHandlers(
  getLogger: () => Logger,
  exit: () => void,
  event: string,
): () => void {
  const bail = (): void => {
    getLogger().fault({ event, path: null, reason: "exception" }).then(exit, exit);
  };
  process.on("uncaughtException", bail);
  process.on("unhandledRejection", bail);
  return bail;
}
