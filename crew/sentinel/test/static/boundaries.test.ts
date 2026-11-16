import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  SENTINEL_ROOT,
  at,
  format,
  isFunctionNode,
  lineOf,
  parse,
  readTree,
  walk,
  type Source,
  type Violation,
} from "../support/scan.js";

const SRC = readTree(join(SENTINEL_ROOT, "src"), ".ts");
const TESTS = readTree(join(SENTINEL_ROOT, "test"), ".ts");
const ENV_NAMES = new Set([
  "COURTLISTENER_TOKEN",
  "COURTLISTENER_BASE_URL",
  "REVEAL_CODES_FIXTURES_ONLY",
  "REVEAL_CODES_CACHE_DIR",
]);
const ALLOWED_NODE = new Set(["node:fs", "node:path", "node:os"]);

function src(text: string, name = "planted.ts"): Source {
  return { path: name, text };
}

function check(file: Source, visit: (n: ts.Node, sf: ts.SourceFile, out: Violation[]) => void) {
  const sf = parse(file);
  const out: Violation[] = [];
  walk(sf, (n) => {
    visit(n, sf, out);
  });
  return out;
}

/** Requirement 1.8: process.env only in cli.ts, and only the four variable names appear. */
function envViolations(file: Source): Violation[] {
  const inCli = basename(file.path) === "cli.ts";
  return check(file, (n, sf, out) => {
    const line = lineOf(sf, n);
    if (ts.isIdentifier(n) && n.text === "process" && !inCli) {
      out.push(at(file, line, "process outside cli.ts"));
    }
    if (ts.isStringLiteral(n) && /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/.test(n.text)) {
      if (!ENV_NAMES.has(n.text)) out.push(at(file, line, `unknown variable name ${n.text}`));
    }
  });
}

/** Requirement 1.8: node: specifiers limited to fs, path and os; fs only in files.ts. */
function nodeViolations(file: Source): Violation[] {
  return check(file, (n, sf, out) => {
    if (!(ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) || !n.moduleSpecifier) return;
    const spec = (n.moduleSpecifier as ts.StringLiteral).text;
    const line = lineOf(sf, n);
    if (spec.startsWith("node:") && !ALLOWED_NODE.has(spec)) {
      out.push(at(file, line, `forbidden import "${spec}"`));
    }
    if (spec === "node:fs" && basename(file.path) !== "files.ts") {
      out.push(at(file, line, "node:fs outside files.ts"));
    }
  });
}

/** Requirement 1.10: no any, no default export, no class. */
function styleViolations(file: Source): Violation[] {
  return check(file, (n, sf, out) => {
    const line = lineOf(sf, n);
    if (n.kind === ts.SyntaxKind.AnyKeyword) out.push(at(file, line, "any"));
    if (ts.isClassDeclaration(n) || ts.isClassExpression(n)) out.push(at(file, line, "class"));
    if (ts.isExportAssignment(n) && !n.isExportEquals) out.push(at(file, line, "default export"));
    const mods = ts.canHaveModifiers(n) ? ts.getModifiers(n) : undefined;
    if (mods?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) {
      out.push(at(file, line, "default export"));
    }
  });
}

function handlesError(block: ts.Block): boolean {
  let handled = false;
  walk(block, (n) => {
    if (ts.isReturnStatement(n) || ts.isThrowStatement(n)) handled = true;
    if (ts.isCallExpression(n) || ts.isBinaryExpression(n)) handled = true;
  });
  return handled;
}

/** Requirement 1.12: a catch block returns, rethrows or records. */
function catchViolations(file: Source): Violation[] {
  return check(file, (n, sf, out) => {
    if (!ts.isCatchClause(n)) return;
    if (n.block.statements.length === 0) out.push(at(file, lineOf(sf, n), "empty catch"));
    else if (!handlesError(n.block)) {
      out.push(at(file, lineOf(sf, n), "catch neither returns, rethrows nor records"));
    }
  });
}

/** Requirement 1.11: modules at most 300 lines, functions at most 40. */
function sizeViolations(file: Source): Violation[] {
  const lines = file.text.split("\n").length - (file.text.endsWith("\n") ? 1 : 0);
  const out: Violation[] = lines > 300 ? [at(file, 1, `module has ${String(lines)} lines`)] : [];
  const sf = parse(file);
  walk(sf, (n) => {
    if (!isFunctionNode(n)) return;
    const a = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line;
    const count = sf.getLineAndCharacterOfPosition(n.getEnd()).line - a + 1;
    if (count > 40) out.push(at(file, a + 1, `function has ${String(count)} lines`));
  });
  return out;
}

/** Requirement 1.8: no new Date() without arguments outside cli.ts. */
function clockViolations(file: Source): Violation[] {
  if (basename(file.path) === "cli.ts") return [];
  return check(file, (n, sf, out) => {
    if (ts.isNewExpression(n) && n.expression.getText(sf) === "Date" && !n.arguments?.length) {
      out.push(at(file, lineOf(sf, n), "new Date() without arguments"));
    }
  });
}

/** Requirement 12.1: no docx import. */
function docxViolations(file: Source): Violation[] {
  return check(file, (n, sf, out) => {
    if (!(ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) || !n.moduleSpecifier) return;
    const spec = (n.moduleSpecifier as ts.StringLiteral).text;
    if (spec === "docx" || spec.startsWith("docx/"))
      out.push(at(file, lineOf(sf, n), "docx import"));
  });
}

/** Requirement 12.16: no snapshot test and no expect(true). */
function weakTestViolations(file: Source): Violation[] {
  return check(file, (n, sf, out) => {
    const line = lineOf(sf, n);
    if (ts.isIdentifier(n) && /^toMatch(Inline|File)?Snapshot$/.test(n.text)) {
      out.push(at(file, line, "snapshot assertion"));
    }
    if (ts.isCallExpression(n) && n.expression.getText(sf) === "expect") {
      if (n.arguments[0]?.kind === ts.SyntaxKind.TrueKeyword)
        out.push(at(file, line, "expect(true)"));
    }
  });
}

/** Requirements 12.14 and 14.9 (three properties, 1, 2 and 3): each `// Property N` sits above exactly one fc.assert in its file. */
function propertyViolations(file: Source): Violation[] {
  const lines = file.text.split("\n");
  const marks = lines.flatMap((text, i) => {
    const m = /^\s*\/\/ Property (\d+)\s*$/.exec(text);
    return m?.[1] === undefined ? [] : [{ line: i + 1, n: Number(m[1]) }];
  });
  const asserts = check(file, (n, sf, out) => {
    if (ts.isCallExpression(n) && n.expression.getText(sf) === "fc.assert") {
      out.push(at(file, lineOf(sf, n), "fc.assert"));
    }
  });
  const out: Violation[] = [];
  if (marks.length !== asserts.length) {
    out.push(
      at(
        file,
        1,
        `${String(marks.length)} Property comments, ${String(asserts.length)} fc.assert calls`,
      ),
    );
  }
  for (const mark of marks) {
    if (!asserts.some((a) => a.line > mark.line))
      out.push(at(file, mark.line, "no fc.assert below"));
  }
  return out;
}

function allNumbers(files: readonly Source[]): number[] {
  return files.flatMap((f) =>
    f.text.split("\n").flatMap((l) => {
      const m = /^\s*\/\/ Property (\d+)\s*$/.exec(l)?.[1];
      return m === undefined ? [] : [Number(m)];
    }),
  );
}

describe("sentinel boundaries _Requirements: 1.8, 1.9, 1.10, 1.11, 1.12_", () => {
  it("self-test: planted environment violations are reported with file:line", () => {
    const planted = src('const a = process.env;\nconst b = "COURTLISTENER_SECRET";\n');
    expect(format(envViolations(planted))).toEqual([
      "planted.ts:1 process outside cli.ts",
      "planted.ts:2 unknown variable name COURTLISTENER_SECRET",
    ]);
    expect(envViolations(src("const t = process.env['COURTLISTENER_TOKEN'];", "cli.ts"))).toEqual(
      [],
    );
  });

  it("process appears only in cli.ts and only the four variable names are used", () => {
    expect(format(SRC.flatMap(envViolations))).toEqual([]);
  });

  it("self-test: planted node: imports are reported", () => {
    const planted = src('import a from "node:fs";\nimport b from "node:crypto";\n');
    expect(format(nodeViolations(planted))).toEqual([
      "planted.ts:1 node:fs outside files.ts",
      'planted.ts:2 forbidden import "node:crypto"',
    ]);
  });

  it("src imports only node:fs, node:path and node:os, and node:fs only in files.ts", () => {
    expect(format(SRC.flatMap(nodeViolations))).toEqual([]);
    const uses = SRC.filter((f) => /from "node:fs"/.test(f.text)).map((f) => basename(f.path));
    expect(uses).toEqual(["files.ts"]);
  });

  it("self-test: planted any, class and default export are reported", () => {
    const planted = src(
      "const a: any = 1;\nclass C {}\nexport default a;\nexport default function f() {}\n",
    );
    const found = format(styleViolations(planted));
    expect(found).toContain("planted.ts:1 any");
    expect(found).toContain("planted.ts:2 class");
    expect(found).toContain("planted.ts:3 default export");
    expect(found).toContain("planted.ts:4 default export");
  });

  it("src has no any, default export or class", () => {
    expect(format(SRC.flatMap(styleViolations))).toEqual([]);
  });

  it("self-test: planted bad catch blocks are reported", () => {
    const planted = src("try { a(); } catch {}\ntry { a(); } catch (e) { const x = 1; }\n");
    expect(format(catchViolations(planted))).toEqual([
      "planted.ts:1 empty catch",
      "planted.ts:2 catch neither returns, rethrows nor records",
    ]);
    expect(catchViolations(src("try { a(); } catch { return 1; }"))).toEqual([]);
  });

  it("every catch in src returns, rethrows or records", () => {
    expect(format(SRC.flatMap(catchViolations))).toEqual([]);
  });

  it("self-test: a planted long module and long function are reported", () => {
    const body = Array.from({ length: 41 }, (_, i) => `  const v${String(i)} = ${String(i)};`);
    expect(format(sizeViolations(src(`function big() {\n${body.join("\n")}\n}\n`)))).toEqual([
      "planted.ts:1 function has 43 lines",
    ]);
    const long = src(Array.from({ length: 301 }, () => "export {};").join("\n"));
    expect(format(sizeViolations(long))).toEqual(["planted.ts:1 module has 301 lines"]);
  });

  it("every src module is at most 300 lines and every function at most 40", () => {
    expect(format(SRC.flatMap(sizeViolations))).toEqual([]);
  });

  it("self-test: a planted new Date() is reported outside cli.ts only", () => {
    const text = "const a = new Date();\nconst b = new Date(0);\n";
    expect(format(clockViolations(src(text)))).toEqual([
      "planted.ts:1 new Date() without arguments",
    ]);
    expect(clockViolations(src(text, "cli.ts"))).toEqual([]);
  });

  it("new Date() with no argument appears only in cli.ts", () => {
    expect(format(SRC.flatMap(clockViolations))).toEqual([]);
  });

  it("self-test: a planted docx import is reported", () => {
    expect(format(docxViolations(src('import { Packer } from "docx";\n')))).toEqual([
      "planted.ts:1 docx import",
    ]);
  });

  it("neither src nor test imports docx", () => {
    expect(format([...SRC, ...TESTS].flatMap(docxViolations))).toEqual([]);
  });

  it("self-test: planted snapshot and expect(true) are reported", () => {
    const planted = src("expect(a).toMatchSnapshot();\nexpect(true).toBe(true);\n");
    expect(format(weakTestViolations(planted))).toEqual([
      "planted.ts:1 snapshot assertion",
      "planted.ts:2 expect(true)",
    ]);
  });

  it("no test uses a snapshot or expect(true)", () => {
    expect(format(TESTS.flatMap(weakTestViolations))).toEqual([]);
  });

  it("PACKAGE_NAME and index.test.ts are gone, and there is no app.json", () => {
    expect(SRC.filter((f) => f.text.includes("PACKAGE_NAME")).map((f) => f.path)).toEqual([]);
    expect(existsSync(join(SENTINEL_ROOT, "test", "index.test.ts"))).toBe(false);
    expect(existsSync(join(SENTINEL_ROOT, "app.json"))).toBe(false);
  });

  it("self-test: planted property mistakes are reported with file:line", () => {
    const bad = src("// Property 1\nit('x', () => {});\n", "p.ts");
    expect(format(propertyViolations(bad))).toEqual([
      "p.ts:1 1 Property comments, 0 fc.assert calls",
      "p.ts:1 no fc.assert below",
    ]);
  });

  it("exactly three Property comments, 1, 2 and 3, each above one fc.assert", () => {
    // case-match.properties.test.ts is checked by the aggregate case-match-inventory.test.ts (task 13.6).
    // recorded-declaration.properties.test.ts holds Property 3 of the pasted-text-declaration spec,
    // whose numbering is its own; it is checked on its own below.
    const all = TESTS.filter(
      (f) =>
        f.path.endsWith(".properties.test.ts") && !f.path.endsWith("case-match.properties.test.ts"),
    );
    const isOtherSpec = (f: Source) => f.path.endsWith("recorded-declaration.properties.test.ts");
    const files = all.filter((f) => !isOtherSpec(f));
    expect(format(files.flatMap(propertyViolations))).toEqual([]);
    expect(allNumbers(files).sort()).toEqual([1, 2, 3]);
  });

  it("recorded-declaration.properties.test.ts carries exactly Property 3 of pasted-text-declaration", () => {
    const other = TESTS.filter((f) => f.path.endsWith("recorded-declaration.properties.test.ts"));
    expect(other).toHaveLength(1);
    expect(format(other.flatMap(propertyViolations))).toEqual([]);
    expect(allNumbers(other)).toEqual([3]);
  });
});
