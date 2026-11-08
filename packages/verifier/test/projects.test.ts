import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readText } from "./support/scan-source";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("vitest projects _Requirements: 15.3_", () => {
  const config = readText(path.join(ROOT, "vitest.config.ts"));

  it("root vitest.config.ts declares the verifier and courtlistener-mcp projects", () => {
    expect(config).toContain('project("verifier", "packages/verifier")');
    expect(config).toContain('project("courtlistener-mcp", "packages/courtlistener-mcp")');
  });
});
