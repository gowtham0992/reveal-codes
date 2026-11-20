/**
 * Run by `crash.test.ts` in a child process through jiti, never bundled. It uses the production
 * `installCrashHandlers` and the production Fault_Log, then fails the way a hook run could:
 * `throw` throws synchronously, `reject` leaves a rejected promise that nobody awaits.
 * Arguments: the mode, then the workspace root that holds `.kiro/provenance`.
 */
import { installCrashHandlers } from "../../src/cli/crash.js";
import { nodeDeps } from "../../src/io/deps.js";
import { createFaultLog } from "../../src/io/faults.js";
const [mode, root] = process.argv.slice(2);
const deps = nodeDeps();
const logger = createFaultLog(deps, `${String(root)}/.kiro/provenance/errors.log`);
installCrashHandlers(
  () => logger,
  () => process.exit(0),
  "agentStop",
);
if (mode === "throw") throw new Error("SECRET file text and payload");
void Promise.reject(new Error("SECRET file text and payload"));
