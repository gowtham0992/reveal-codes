import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WEB_ROOT } from "../support/scan";

const REPO_ROOT = join(WEB_ROOT, "..", "..");

describe("Declaration files are not committed _Requirements: 14.4_", () => {
  it("git ls-files lists no .d.ts other than apps/web/src/css-modules.d.ts", () => {
    const listed = execFileSync("git", ["ls-files", "*.d.ts", "**/*.d.ts"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    })
      .split("\n")
      .filter((line) => line !== "");
    expect(listed.filter((p) => p !== "apps/web/src/css-modules.d.ts")).toEqual([]);
  });
});
