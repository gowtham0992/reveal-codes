import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  collect,
  functionsOf,
  formatViolations,
  lineOfNode,
  parseSource,
  readSources,
  violation,
  visit,
  type SourceText,
  type Violation,
} from "../support/scan";

const MAX_FUNCTION_LINES = 40;
const ASSERT_ROOTS = new Set(["expect", "assert", "expectTypeOf", "fail"]);

/** A `describe(...)` callback only groups tests; the tests inside it are the functions that count. */
function isDescribeCallback(node: ts.Node): boolean {
  const call = node.parent;
  if (!ts.isCallExpression(call) || !call.arguments.includes(node as ts.Expression)) return false;
  let callee: ts.Expression = call.expression;
  while (ts.isPropertyAccessExpression(callee) || ts.isCallExpression(callee)) {
    callee = callee.expression;
  }
  return ts.isIdentifier(callee) && callee.text === "describe";
}

/** Requirement 2.7: at most 40 lines per function, in source and in tests. */
function functionLengthViolations(file: SourceText): Violation[] {
  return functionsOf(file)
    .filter((f) => f.lines > MAX_FUNCTION_LINES && !isDescribeCallback(f.node))
    .map((f) =>
      violation(
        file.path,
        f.line,
        `function ${f.name} has ${String(f.lines)} lines, limit is ${String(MAX_FUNCTION_LINES)}`,
      ),
    );
}

function rootIdentifier(expression: ts.Expression): string | null {
  let current = expression;
  for (;;) {
    if (ts.isIdentifier(current)) return current.text;
    if (ts.isPropertyAccessExpression(current) || ts.isCallExpression(current)) {
      current = current.expression;
    } else {
      return null;
    }
  }
}

function mentions(root: ts.Node, name: string): boolean {
  let found = false;
  visit(root, (n) => {
    if (ts.isIdentifier(n) && n.text === name) found = true;
  });
  return found;
}

/** A catch handles the error properly if it rethrows, returns the error, or asserts. */
function catchHandlesError(clause: ts.CatchClause): boolean {
  const name = clause.variableDeclaration?.name.getText();
  let handled = false;
  visit(clause.block, (n) => {
    if (ts.isThrowStatement(n)) handled = true;
    if (ts.isReturnStatement(n) && n.expression !== undefined) {
      if (name !== undefined && mentions(n.expression, name)) handled = true;
    }
    if (ts.isCallExpression(n)) {
      const root = rootIdentifier(n.expression);
      if (root !== null && ASSERT_ROOTS.has(root)) handled = true;
    }
  });
  return handled;
}

/** Requirement 2.8: no catch that swallows the error. */
function swallowingCatchViolations(file: SourceText): Violation[] {
  const sf = parseSource(file);
  return collect(sf, ts.isCatchClause)
    .filter((clause) => !catchHandlesError(clause))
    .map((clause) =>
      violation(
        file.path,
        lineOfNode(sf, clause),
        "catch neither rethrows, returns the error, nor asserts",
      ),
    );
}

function allChecks(file: SourceText): Violation[] {
  return [...functionLengthViolations(file), ...swallowingCatchViolations(file)];
}

describe("static: function length and catch blocks _Requirements: 2.7, 2.8_", () => {
  it("keeps every function in src, app and test within 40 lines", () => {
    const files = readSources(["src", "app", "test"]);
    expect(formatViolations(files.flatMap(functionLengthViolations))).toEqual([]);
  });

  it("has no catch that swallows an error in src, app and test", () => {
    const files = readSources(["src", "app", "test"]);
    expect(formatViolations(files.flatMap(swallowingCatchViolations))).toEqual([]);
  });
});

function longFunction(lines: number): string {
  const body = Array.from({ length: lines - 2 }, () => "  const a = 1;").join("\n");
  return `function long() {\n${body}\n}\n`;
}

describe("static: limits self-test (planted violations)", () => {
  it("reports a 41-line function with path and start line, and accepts 40", () => {
    const planted = { path: "src/long.ts", text: `const x = 1;\n${longFunction(41)}` };
    expect(formatViolations(functionLengthViolations(planted))).toEqual([
      "src/long.ts:2 function long has 41 lines, limit is 40",
    ]);
    expect(functionLengthViolations({ path: "src/ok.ts", text: longFunction(40) })).toEqual([]);
  });

  it("counts functions in tests, but not a describe callback", () => {
    const inner = longFunction(41)
      .replace("function long() {", "it('x', () => {")
      .replace(/}\n$/, "});\n");
    const text = `describe('g', () => {\n${inner}});\n`;
    expect(formatViolations(allChecks({ path: "test/a.test.ts", text }))).toEqual([
      "test/a.test.ts:2 function (anonymous) has 41 lines, limit is 40",
    ]);
  });

  it("reports an empty catch and a catch that only logs, with path and line", () => {
    const text = "try { a(); } catch {}\nconst b = 1;\ntry { a(); } catch (e) { log(e); }\n";
    expect(formatViolations(allChecks({ path: "src/swallow.ts", text }))).toEqual([
      "src/swallow.ts:1 catch neither rethrows, returns the error, nor asserts",
      "src/swallow.ts:3 catch neither rethrows, returns the error, nor asserts",
    ]);
  });

  it("accepts a catch that rethrows, returns the error, or asserts", () => {
    const text = [
      "try { a(); } catch (e) { throw e; }",
      "function f() { try { a(); } catch (e) { return { ok: false, error: e }; } }",
      "try { a(); } catch (e) { expect(e).toBeInstanceOf(Error); }",
      "",
    ].join("\n");
    expect(allChecks({ path: "src/ok.ts", text })).toEqual([]);
  });
});
