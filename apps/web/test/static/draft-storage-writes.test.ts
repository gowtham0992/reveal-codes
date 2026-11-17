import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  collect,
  findAll,
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

const HANDOVER_OWNER = "src/handover.ts";
const HANDOVER_LITERAL = "reveal-codes:check-handover:v1";

/** Any identifier `HANDOVER_KEY` or the key's literal, outside `handover.ts`. */
function handoverNamingViolations(file: SourceText): Violation[] {
  if (file.path === HANDOVER_OWNER) return [];
  const sf = parseSource(file);
  const named = findAll(
    sf,
    (n) =>
      (ts.isIdentifier(n) && n.text === "HANDOVER_KEY") ||
      (ts.isStringLiteralLike(n) && n.text === HANDOVER_LITERAL),
  );
  return named.map((n) =>
    violation(file.path, lineOfNode(sf, n), "names HANDOVER_KEY outside handover.ts"),
  );
}

/** Calls of `x.setItem(HANDOVER_KEY, ...)` and `x.removeItem(HANDOVER_KEY)` outside `handover.ts`. */
function handoverWriteViolations(file: SourceText): Violation[] {
  if (file.path === HANDOVER_OWNER) return [];
  const sf = parseSource(file);
  return collect(sf, ts.isCallExpression)
    .filter((call) => {
      const callee = call.expression;
      const arg = call.arguments[0];
      return (
        ts.isPropertyAccessExpression(callee) &&
        WRITERS.has(callee.name.text) &&
        arg !== undefined &&
        ((ts.isIdentifier(arg) && arg.text === "HANDOVER_KEY") ||
          (ts.isStringLiteralLike(arg) && arg.text === HANDOVER_LITERAL))
      );
    })
    .map((call) =>
      violation(
        file.path,
        lineOfNode(sf, call),
        "writes or removes HANDOVER_KEY outside handover.ts",
      ),
    );
}

function handoverViolations(file: SourceText): Violation[] {
  return [...handoverNamingViolations(file), ...handoverWriteViolations(file)];
}

describe("static: only handover.ts names or writes the handover key _Requirements: 3.10, 16.1_", () => {
  it("has no HANDOVER_KEY, its literal, or a write to it under src and app except in handover.ts", () => {
    const files = readSources(["src", "app"]);
    expect(files.some((f) => f.path === HANDOVER_OWNER)).toBe(true);
    expect(formatViolations(files.flatMap(handoverViolations))).toEqual([]);
  });

  it("finds the key and the writes in handover.ts itself, so the scan is not vacuous", () => {
    const own = readSources(["src"]).find((f) => f.path === HANDOVER_OWNER);
    const asElsewhere = { path: "src/elsewhere.ts", text: own?.text ?? "" };
    expect(handoverNamingViolations(asElsewhere).length).toBeGreaterThanOrEqual(1);
    expect(handoverWriteViolations(asElsewhere).length).toBeGreaterThanOrEqual(1);
  });

  it("reports planted naming and writes, by identifier or literal, with path and line", () => {
    const text = [
      "session.setItem(HANDOVER_KEY, text);",
      "session.removeItem(HANDOVER_KEY);",
      `svc.session.setItem("${HANDOVER_LITERAL}", text);`,
      "",
    ].join("\n");
    expect(formatViolations(handoverViolations({ path: "src/check/x.ts", text }))).toEqual([
      "src/check/x.ts:1 names HANDOVER_KEY outside handover.ts",
      "src/check/x.ts:2 names HANDOVER_KEY outside handover.ts",
      "src/check/x.ts:3 names HANDOVER_KEY outside handover.ts",
      "src/check/x.ts:1 writes or removes HANDOVER_KEY outside handover.ts",
      "src/check/x.ts:2 writes or removes HANDOVER_KEY outside handover.ts",
      "src/check/x.ts:3 writes or removes HANDOVER_KEY outside handover.ts",
    ]);
  });

  it("accepts the same text inside handover.ts and unrelated keys elsewhere", () => {
    const text = "session.setItem(HANDOVER_KEY, t);\nsession.setItem(OTHER, t);\n";
    expect(handoverViolations({ path: HANDOVER_OWNER, text })).toEqual([]);
    expect(handoverViolations({ path: "src/y.ts", text: "s.setItem(OTHER, t);\n" })).toEqual([]);
  });
});
