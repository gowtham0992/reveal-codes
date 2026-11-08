import { describe, expect, it } from "vitest";
import {
  formatViolations,
  readSources,
  scanStripped,
  violation,
  type SourceText,
  type Violation,
} from "../support/scan";

const ENV_OWNER = "src/server/deps.ts";
const MAX_MODULE_LINES = 300;

/** Requirement 2.3: `process.env` only in `src/server/deps.ts`. */
export function envViolations(file: SourceText): Violation[] {
  if (file.path === ENV_OWNER) return [];
  return scanStripped(
    file,
    /\bprocess\s*(?:\??\.\s*env\b|\[)/,
    "process.env is read outside src/server/deps.ts",
  );
}

/** Requirement 2.4: at most 300 lines per module. A final newline does not start a line. */
export function sizeViolations(file: SourceText): Violation[] {
  const lines = file.text.replace(/\n$/, "").split("\n").length;
  if (lines <= MAX_MODULE_LINES) return [];
  return [
    violation(
      file.path,
      MAX_MODULE_LINES + 1,
      `module has ${String(lines)} lines, limit is ${String(MAX_MODULE_LINES)}`,
    ),
  ];
}

const appSources = readSources(["src", "app"]);

describe("static: environment and module size _Requirements: 2.3, 2.4_", () => {
  it("reads process.env only in src/server/deps.ts", () => {
    expect(formatViolations(appSources.flatMap(envViolations))).toEqual([]);
  });

  it("keeps every module under src and app at 300 lines or fewer", () => {
    expect(formatViolations(appSources.flatMap(sizeViolations))).toEqual([]);
  });
});

describe("static: environment and size self-test (planted violations)", () => {
  it("reports a planted process.env with path and line", () => {
    const planted = {
      path: "src/client/bad.ts",
      text: 'const ok = 1;\n// process.env in a comment is fine\nconst s = "process.env";\nexport const t = process.env.TOKEN;\n',
    };
    expect(formatViolations(envViolations(planted))).toEqual([
      "src/client/bad.ts:4 process.env is read outside src/server/deps.ts",
    ]);
  });

  it("allows process.env in src/server/deps.ts", () => {
    const owner = { path: ENV_OWNER, text: "export const e = process.env;\n" };
    expect(envViolations(owner)).toEqual([]);
  });

  it("reports a module of 301 lines and accepts 300", () => {
    const big = { path: "src/big.ts", text: "const a = 1;\n".repeat(301) };
    const edge = { path: "src/edge.ts", text: "const a = 1;\n".repeat(300) };
    expect(formatViolations(sizeViolations(big))).toEqual([
      "src/big.ts:301 module has 301 lines, limit is 300",
    ]);
    expect(sizeViolations(edge)).toEqual([]);
  });
});
