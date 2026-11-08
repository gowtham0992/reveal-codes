import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = join(__dirname, "../../../scripts/commit-task.sh");

function scopeOf(paths: readonly string[]): string {
  const run = spawnSync("bash", [SCRIPT, "--print-scope"], {
    encoding: "utf8",
    input: paths.join("\n") + "\n",
  });
  expect(run.status).toBe(0);
  return run.stdout;
}

describe("commit-task.sh --print-scope _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.8, 14.8_", () => {
  it("picks the shared package or app name and falls back to repo", () => {
    expect(scopeOf(["apps/web/src/a.ts", ".kiro/specs/x/tasks.md"])).toBe("web");
    expect(scopeOf(["packages/engine/src/a.ts", "packages/verifier/src/b.ts"])).toBe("repo");
    expect(scopeOf(["BUILD_LOG.md"])).toBe("repo");
  });
});
