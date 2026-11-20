import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
const ENTRY = new URL("./support/crash-entry.ts", import.meta.url).pathname;
const JITI = import.meta.resolve("jiti/register");
let root: string | null = null;
afterEach(() => {
  if (root !== null) rmSync(root, { recursive: true, force: true });
  root = null;
});
function crash(mode: "throw" | "reject") {
  root = mkdtempSync(join(tmpdir(), "reveal-crash-"));
  mkdirSync(join(root, ".kiro/provenance"), { recursive: true });
  const ran = spawnSync(process.execPath, ["--import", JITI, ENTRY, mode, root], {
    cwd: root,
    encoding: "utf8",
    timeout: 20_000,
  });
  const log = readFileSync(join(root, ".kiro/provenance/errors.log"), "utf8");
  return { ran, log };
}
describe("crash handlers of the record command _Requirements: 7.1, 7.2, 7.3, 7.4_", () => {
  it.each(["throw", "reject"] as const)(
    "an uncaught %s exits 0 with no output and one exception line",
    (mode) => {
      const { ran, log } = crash(mode);
      expect(ran.status).toBe(0);
      expect(ran.stdout).toBe("");
      expect(ran.stderr).toBe("");
      const lines = log.split("\n").filter((l) => l !== "");
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatch(/^\d{4}-\d\d-\d\dT[\d:.]+Z agentStop - exception$/u);
      expect(log).not.toContain("SECRET");
    },
  );
});
