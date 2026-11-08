import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), "utf8");
const pkg = JSON.parse(read("../package.json")) as {
  dependencies: Record<string, string>;
  scripts: Record<string, string>;
};

describe("package pins _Requirements: 13.16, 13.17_", () => {
  it("pins the SDK to one exact 1.x version", () => {
    expect(pkg.dependencies["@modelcontextprotocol/sdk"]).toMatch(/^1\.\d+\.\d+$/);
  });

  it("pins zod without a range operator", () => {
    expect(pkg.dependencies["zod"]).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("starts through jiti", () => {
    expect(pkg.scripts["start"]).toBe("node --import jiti/register src/main.ts");
  });

  it("sets the silent reporter in the root .npmrc", () => {
    const lines = read("../../../.npmrc").split(/\r?\n/);
    expect(lines.map((l) => l.trim())).toContain("reporter=silent");
  });
});
