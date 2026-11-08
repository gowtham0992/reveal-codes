import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Read as text: importing the root config would pull a file outside this
// project's rootDir into the TypeScript build.
const source = readFileSync(new URL("../../../vitest.config.ts", import.meta.url), "utf8");

describe("root vitest.config.ts _Requirements: 1.10_", () => {
  it("names a web project rooted at apps/web", () => {
    expect(source).toContain('project("web", "apps/web"');
  });

  it("includes both .ts and .tsx test globs for the web project", () => {
    const line = source.split("\n").find((l) => l.includes('project("web"')) ?? "";
    expect(line).toContain('"test/**/*.test.ts"');
    expect(line).toContain('"test/**/*.test.tsx"');
  });

  it("compiles JSX with the automatic runtime", () => {
    expect(source).toMatch(/oxc:\s*\{\s*jsx:\s*\{\s*runtime:\s*"automatic"/);
  });
});
