import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  collect,
  formatViolations,
  lineOfNode,
  parseSource,
  readSources,
  violation,
  type SourceText,
  type Violation,
} from "../support/scan";

const OWNER = "src/autosave.ts";
const KEY_LITERAL = "reveal-codes:document:v1";
const WRITERS = new Set(["setItem", "removeItem"]);

function namesTheKey(arg: ts.Expression | undefined): boolean {
  if (arg === undefined) return false;
  if (ts.isIdentifier(arg)) return arg.text === "AUTOSAVE_KEY";
  return ts.isStringLiteralLike(arg) && arg.text === KEY_LITERAL;
}

/** Calls of `x.setItem(AUTOSAVE_KEY, ...)` and `x.removeItem(AUTOSAVE_KEY)` outside `autosave.ts`. */
function keyWriteViolations(file: SourceText): Violation[] {
  if (file.path === OWNER) return [];
  const sf = parseSource(file);
  return collect(sf, ts.isCallExpression)
    .filter((call) => {
      const callee = call.expression;
      return (
        ts.isPropertyAccessExpression(callee) &&
        WRITERS.has(callee.name.text) &&
        namesTheKey(call.arguments[0])
      );
    })
    .map((call) =>
      violation(
        file.path,
        lineOfNode(sf, call),
        "writes or removes AUTOSAVE_KEY outside autosave.ts",
      ),
    );
}

describe("static: only autosave.ts writes the draft key _Requirements: 23.19_", () => {
  it("has no setItem or removeItem on AUTOSAVE_KEY under src except in autosave.ts", () => {
    const files = readSources(["src"]);
    expect(files.some((f) => f.path === OWNER)).toBe(true);
    expect(formatViolations(files.flatMap(keyWriteViolations))).toEqual([]);
  });

  it("finds the calls in autosave.ts itself, so the scan is not vacuous", () => {
    const own = readSources(["src"]).find((f) => f.path === OWNER);
    const asElsewhere = { path: "src/elsewhere.ts", text: own?.text ?? "" };
    expect(keyWriteViolations(asElsewhere).length).toBeGreaterThanOrEqual(2);
  });
});

describe("static: draft key writes self-test (planted violations)", () => {
  it("reports setItem and removeItem on the key, by identifier or literal, with path and line", () => {
    const text = [
      "storage.setItem(AUTOSAVE_KEY, text);",
      "storage.removeItem(AUTOSAVE_KEY);",
      `svc.storage.setItem("${KEY_LITERAL}", text);`,
      "",
    ].join("\n");
    expect(formatViolations(keyWriteViolations({ path: "src/x.ts", text }))).toEqual([
      "src/x.ts:1 writes or removes AUTOSAVE_KEY outside autosave.ts",
      "src/x.ts:2 writes or removes AUTOSAVE_KEY outside autosave.ts",
      "src/x.ts:3 writes or removes AUTOSAVE_KEY outside autosave.ts",
    ]);
  });

  it("accepts getItem on the key, other keys, and the same calls inside autosave.ts", () => {
    const text = "s.getItem(AUTOSAVE_KEY);\ns.setItem(OTHER, t);\ns.removeItem(OTHER);\n";
    expect(keyWriteViolations({ path: "src/y.ts", text })).toEqual([]);
    const own = "s.setItem(AUTOSAVE_KEY, t);\n";
    expect(keyWriteViolations({ path: OWNER, text: own })).toEqual([]);
  });
});
