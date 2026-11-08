import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkLimits, formatViolation } from "./support/check-limits";
import { listTsFiles, readText } from "./support/scan-source";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VERIFIER = path.resolve(HERE, "..");
const MCP = path.resolve(HERE, "../../courtlistener-mcp");
const DIRS = [path.join(VERIFIER, "src"), path.join(VERIFIER, "test"), path.join(MCP, "src")];
const REPO = path.resolve(HERE, "../../..");

function scanDirs(): string[] {
  return DIRS.filter((d) => existsSync(d)).flatMap((d) =>
    listTsFiles(d).flatMap((f) =>
      checkLimits(path.relative(REPO, f), readText(f)).map(formatViolation),
    ),
  );
}

describe("size and style limits _Requirements: 15.4, 15.5, 15.6_", () => {
  it("verifier src and test and MCP src stay within the limits", () => {
    expect(scanDirs()).toEqual([]);
  });

  it("reports an over-long file", () => {
    const text = Array.from({ length: 301 }, () => "export const a = 1;").join("\n") + "\n";
    expect(checkLimits("big.ts", text).map(formatViolation)).toEqual([
      "big.ts:1 file is 301 lines",
    ]);
  });

  it("reports an over-long function, `any`, and export default", () => {
    const body = Array.from({ length: 40 }, () => "  void 0;").join("\n");
    const text = `export function f(x: any) {\n${body}\n}\nexport default f;\n`;
    const found = checkLimits("f.ts", text).map(formatViolation);
    expect(found).toContain("f.ts:1 function body is 42 lines");
    expect(found).toContain("f.ts:1 uses `any`");
    expect(found).toContain("f.ts:43 export default");
  });

  it("accepts a function of exactly 40 lines", () => {
    const body = Array.from({ length: 38 }, () => "  void 0;").join("\n");
    expect(checkLimits("g.ts", `export function g() {\n${body}\n}\n`)).toEqual([]);
  });

  it("flags a swallowing catch and accepts rethrow, err() and expect", () => {
    const bad = "try { a(); } catch (e) { void e; }";
    expect(checkLimits("c.ts", bad).map(formatViolation)).toEqual([
      "c.ts:1 catch neither rethrows, returns err(...), nor asserts",
    ]);
    const good = [
      "try { a(); } catch (e) { throw e; }",
      "function h() { try { a(); } catch (e) { return err(String(e)); } }",
      "try { a(); } catch (e) { expect(e).toBeInstanceOf(Error); }",
    ].join("\n");
    expect(checkLimits("c.ts", good)).toEqual([]);
  });
});
