import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as wording from "../../src/wording.js";
import {
  PACKAGE_ROOT,
  at,
  format,
  isFunctionNode,
  lineOf,
  literals,
  parse,
  readDir,
  walk,
  type Source,
  type Violation,
} from "../support/scan.js";

const SRC = readDir(join(PACKAGE_ROOT, "src"), ".ts");
const TEST_DIR = join(PACKAGE_ROOT, "test");
const FORBIDDEN_GLOBALS = new Set(["fetch", "XMLHttpRequest", "WebSocket", "sendBeacon"]);
const NODE_BUILTINS =
  /^(fs|path|os|crypto|url|util|stream|buffer|http|https|child_process|zlib)(\/.*)?$/;
// `document` is also the name of the Engine Document parameter, so only DOM members of it count.
const DOM_GLOBALS = new Set([
  "window",
  "navigator",
  "localStorage",
  "sessionStorage",
  "HTMLElement",
]);
const DOM_DOCUMENT_MEMBERS = new Set([
  "createElement",
  "body",
  "getElementById",
  "querySelector",
  "cookie",
]);
const MAX_MODULE_LINES = 300;
const MAX_FUNCTION_LINES = 40;

function src(text: string, name = "planted.ts"): Source {
  return { path: name, text };
}

function isForbiddenModule(spec: string): boolean {
  return (
    spec.startsWith("node:") ||
    NODE_BUILTINS.test(spec) ||
    spec === "react" ||
    spec.startsWith("react/") ||
    spec === "react-dom" ||
    spec.startsWith("react-dom/")
  );
}

/** Requirement 9.1: no network, Node, React or DOM reference. */
function environmentViolations(file: Source): Violation[] {
  const sf = parse(file);
  const out: Violation[] = [];
  walk(sf, (n) => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier) {
      const spec = (n.moduleSpecifier as ts.StringLiteral).text;
      if (isForbiddenModule(spec)) out.push(at(file, lineOf(sf, n), `forbidden import "${spec}"`));
    }
    if (ts.isIdentifier(n) && FORBIDDEN_GLOBALS.has(n.text)) {
      out.push(at(file, lineOf(sf, n), `forbidden reference ${n.text}`));
    }
    if (ts.isIdentifier(n) && DOM_GLOBALS.has(n.text)) {
      out.push(at(file, lineOf(sf, n), `DOM global ${n.text}`));
    }
    if (ts.isPropertyAccessExpression(n) && n.expression.getText(sf) === "document") {
      if (DOM_DOCUMENT_MEMBERS.has(n.name.text)) {
        out.push(at(file, lineOf(sf, n), `DOM global document.${n.name.text}`));
      }
    }
  });
  return out;
}

/** Names that may appear only in the listed files (identifiers, so comments do not count). */
function gateViolations(file: Source, name: string, allowed: readonly string[]): Violation[] {
  if (allowed.includes(basename(file.path))) return [];
  const sf = parse(file);
  const out: Violation[] = [];
  walk(sf, (n) => {
    if (ts.isIdentifier(n) && n.text === name) {
      out.push(at(file, lineOf(sf, n), `${name} outside ${allowed.join(", ")}`));
    }
  });
  return out;
}

/** Fixed sentences (20+ characters) held by wording.ts, plus fragments of its template sentences. */
const FRAGMENTS = [
  ...Object.values(wording).flatMap((v) => (typeof v === "string" && v.length >= 20 ? [v] : [])),
  "Generative artificial intelligence was used",
  "checked against the CourtListener database",
  "Quotations attributed to a cited decision",
  "were subsequently edited by the author",
];

function wordingViolations(file: Source): Violation[] {
  if (basename(file.path) === "wording.ts") return [];
  return literals(file).flatMap((l) =>
    FRAGMENTS.filter((f) => l.text.includes(f) || (l.text.length >= 20 && f.includes(l.text))).map(
      (f) => at(file, l.line, `statement sentence outside wording.ts: "${f.slice(0, 40)}"`),
    ),
  );
}

/** Requirement 3.11: no clock, random source or process access. */
function nondeterminismViolations(file: Source): Violation[] {
  const sf = parse(file);
  const out: Violation[] = [];
  walk(sf, (n) => {
    const line = lineOf(sf, n);
    if (ts.isPropertyAccessExpression(n)) {
      const text = n.getText(sf);
      if (text === "Date.now") out.push(at(file, line, "Date.now"));
      if (text === "Math.random") out.push(at(file, line, "Math.random"));
    }
    if (
      ts.isNewExpression(n) &&
      n.expression.getText(sf) === "Date" &&
      (n.arguments?.length ?? 0) === 0
    ) {
      out.push(at(file, line, "new Date() without arguments"));
    }
    if (ts.isIdentifier(n) && n.text === "process" && !ts.isPropertyAccessExpression(n.parent)) {
      out.push(at(file, line, "process"));
    } else if (
      ts.isIdentifier(n) &&
      n.text === "process" &&
      ts.isPropertyAccessExpression(n.parent) &&
      n.parent.expression === n
    ) {
      out.push(at(file, line, "process"));
    }
  });
  return out;
}

function sizeViolations(file: Source): Violation[] {
  const out: Violation[] = [];
  const lines = file.text.split("\n").length - (file.text.endsWith("\n") ? 1 : 0);
  if (lines > MAX_MODULE_LINES) out.push(at(file, 1, `module has ${String(lines)} lines`));
  const sf = parse(file);
  walk(sf, (n) => {
    if (!isFunctionNode(n)) return;
    const a = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line;
    const b = sf.getLineAndCharacterOfPosition(n.getEnd()).line;
    const count = b - a + 1;
    if (count > MAX_FUNCTION_LINES)
      out.push(at(file, a + 1, `function has ${String(count)} lines`));
  });
  return out;
}

const PLANTED_ENV = src(
  [
    'import { readFileSync } from "node:fs";',
    'import React from "react";',
    "const a = fetch('/x');",
    "navigator.sendBeacon('/y');",
    "const w = new WebSocket('ws://z');",
  ].join("\n"),
);

describe("package boundaries _Requirements: 9.1, 10.9_", () => {
  it("self-test: planted environment violations are reported with file:line", () => {
    const found = format(environmentViolations(PLANTED_ENV));
    expect(found).toContain('planted.ts:1 forbidden import "node:fs"');
    expect(found).toContain('planted.ts:2 forbidden import "react"');
    expect(found).toContain("planted.ts:3 forbidden reference fetch");
    expect(found).toContain("planted.ts:4 forbidden reference sendBeacon");
    expect(found).toContain("planted.ts:5 forbidden reference WebSocket");
  });

  it("src has no network, node:, react or DOM reference", () => {
    expect(format(SRC.flatMap(environmentViolations))).toEqual([]);
  });

  it("self-test: a planted blockingIssues use outside gate.ts is reported", () => {
    const planted = src("const x = 1;\nblockingIssues(doc);\n", "other.ts");
    expect(format(gateViolations(planted, "blockingIssues", ["gate.ts"]))).toEqual([
      "other.ts:2 blockingIssues outside gate.ts",
    ]);
    expect(gateViolations(src("canExport(d);", "gate.ts"), "canExport", ["gate.ts"])).toEqual([]);
  });

  it("blockingIssues appears only in gate.ts, and canExport only in gate.ts and the index re-export", () => {
    expect(format(SRC.flatMap((f) => gateViolations(f, "blockingIssues", ["gate.ts"])))).toEqual(
      [],
    );
    expect(
      format(SRC.flatMap((f) => gateViolations(f, "canExport", ["gate.ts", "index.ts"]))),
    ).toEqual([]);
  });

  it("self-test: a planted statement sentence outside wording.ts is reported", () => {
    const planted = src(`const a = 1;\nconst s = "${wording.PARAGRAPH_1}";\n`, "other.ts");
    const found = format(wordingViolations(planted));
    expect(found.length).toBeGreaterThan(0);
    expect(found[0]).toMatch(/^other\.ts:2 statement sentence outside wording\.ts/);
    expect(wordingViolations(src(`const s = "${wording.PARAGRAPH_1}";`, "wording.ts"))).toEqual([]);
  });

  it("statement sentences appear only in wording.ts", () => {
    expect(format(SRC.flatMap(wordingViolations))).toEqual([]);
  });

  it("self-test: planted clock, random and process use is reported", () => {
    const planted = src(
      "const a = Date.now();\nconst b = new Date();\nconst c = Math.random();\nconst d = process.env;\nconst e = new Date(0);\n",
    );
    const found = format(nondeterminismViolations(planted));
    expect(found).toEqual([
      "planted.ts:1 Date.now",
      "planted.ts:2 new Date() without arguments",
      "planted.ts:3 Math.random",
      "planted.ts:4 process",
    ]);
  });

  it("src reads no clock, random source or process", () => {
    expect(format(SRC.flatMap(nondeterminismViolations))).toEqual([]);
  });

  it("self-test: a planted long module and long function are reported", () => {
    const body = Array.from({ length: 41 }, (_, i) => `  const v${String(i)} = ${String(i)};`);
    const fn = src(`function big() {\n${body.join("\n")}\n}\n`);
    expect(format(sizeViolations(fn))).toEqual(["planted.ts:1 function has 43 lines"]);
    const long = src(Array.from({ length: 301 }, () => "export {};").join("\n"));
    expect(format(sizeViolations(long))).toEqual(["planted.ts:1 module has 301 lines"]);
  });

  it("every src module is at most 300 lines and every function at most 40", () => {
    expect(format(SRC.flatMap(sizeViolations))).toEqual([]);
  });
});

type PropertyFile = {
  readonly spec: "export-certification" | "court-orders" | "pasted-text-declaration" | "open-draft";
  readonly file: string;
  readonly numbers: readonly number[];
};
const PROPERTY_FILES: readonly PropertyFile[] = [
  { spec: "export-certification", file: "gate.properties.test.ts", numbers: [1] },
  { spec: "export-certification", file: "statement.properties.test.ts", numbers: [2] },
  { spec: "export-certification", file: "appendix.properties.test.ts", numbers: [3] },
  { spec: "export-certification", file: "docx.properties.test.ts", numbers: [4] },
  { spec: "court-orders", file: "order-citation.properties.test.ts", numbers: [1] },
  { spec: "court-orders", file: "order-gate.properties.test.ts", numbers: [2] },
  {
    spec: "pasted-text-declaration",
    file: "statement-declaration.properties.test.ts",
    numbers: [1],
  },
  { spec: "pasted-text-declaration", file: "declaration-gate.properties.test.ts", numbers: [2] },
  // open-draft: Properties 1, 9 (task 2.7) and later 12 (task 2.8) share this one file.
  // word-draft.properties.test.ts (tasks 2.9-2.11) is added with its file: the per-spec
  // check below requires every listed file to exist.
  { spec: "open-draft", file: "docx-read.properties.test.ts", numbers: [1, 9] },
];
const EXPECTED_NUMBERS: Readonly<Record<PropertyFile["spec"], readonly number[]>> = {
  "export-certification": [1, 2, 3, 4],
  "court-orders": [1, 2],
  // Properties 3 and 4 of this spec live in crew/sentinel and apps/web.
  "pasted-text-declaration": [1, 2],
  // Task 2.8 adds 12 here; tasks 2.9-2.11 add 2, 3 and 8 with word-draft.properties.test.ts.
  "open-draft": [1, 9],
};

/** Each `// Property N` comment, in order, must match `expected` and be followed by its own `fc.assert`. */
function propertyViolations(file: Source, expected: readonly number[]): Violation[] {
  const lines = file.text.split("\n");
  const marks: { line: number; n: number }[] = [];
  lines.forEach((text, i) => {
    const m = /^\s*\/\/ Property (\d+)\s*$/.exec(text);
    if (m?.[1] !== undefined) marks.push({ line: i + 1, n: Number(m[1]) });
  });
  const out: Violation[] = [];
  const assertLines = lines.flatMap((l, i) => (l.includes("fc.assert(") ? [i + 1] : []));
  const want = String(expected.length);
  if (marks.length !== expected.length)
    out.push(at(file, 1, `${String(marks.length)} Property comments, want ${want}`));
  if (assertLines.length !== expected.length)
    out.push(at(file, 1, `${String(assertLines.length)} fc.assert calls, want ${want}`));
  marks.forEach((mark, i) => {
    const wantN = expected[i];
    if (wantN !== undefined && mark.n !== wantN)
      out.push(at(file, mark.line, `Property ${String(mark.n)}, want ${String(wantN)}`));
    const next = marks[i + 1]?.line ?? Infinity;
    const own = assertLines.filter((l) => l > mark.line && l < next);
    if (own.length !== 1) out.push(at(file, mark.line, "want one fc.assert below the comment"));
  });
  return out;
}

describe("property files _Requirements: 10.5_", () => {
  it("self-test: planted property mistakes are reported with file:line", () => {
    const bad = src(
      "// Property 7\nit('x', () => {\n  fc.assert(a);\n  fc.assert(b);\n});\n",
      "p.ts",
    );
    const found = format(propertyViolations(bad, [2]));
    expect(found).toContain("p.ts:1 2 fc.assert calls, want 1".replace("p.ts:1 2", "p.ts:1 2"));
    expect(found).toContain("p.ts:1 Property 7, want 2");
    const none = format(propertyViolations(src("it('x', () => {});\n", "q.ts"), [1]));
    expect(none).toContain("q.ts:1 0 Property comments, want 1");
  });

  it("each existing property file holds its own numbered comment above a single fc.assert", () => {
    const present = PROPERTY_FILES.filter((p) => existsSync(join(TEST_DIR, p.file)));
    // case-match numbers its properties within its own spec (design D9); task 13.6 checks them.
    const sources = readDir(TEST_DIR, ".properties.test.ts").filter(
      (s) => basename(s.path) !== "case-match.properties.test.ts",
    );
    const violations = sources.flatMap((s) => {
      const entry = PROPERTY_FILES.find((p) => p.file === basename(s.path));
      if (entry === undefined) return [at(s, 1, "property file is not one of the known files")];
      return propertyViolations(s, entry.numbers);
    });
    expect(format(violations)).toEqual([]);
    expect(present.length).toBe(sources.length);
  });

  it.each(Object.keys(EXPECTED_NUMBERS) as PropertyFile["spec"][])(
    "the %s property comments are exactly its expected numbers",
    (spec) => {
      const files = PROPERTY_FILES.filter((p) => p.spec === spec).map((p) => p.file);
      const sources = readDir(TEST_DIR, ".properties.test.ts").filter((s) =>
        files.includes(basename(s.path)),
      );
      expect(sources.length).toBe(files.length);
      const numbers = sources.flatMap((s) =>
        s.text
          .split("\n")
          .map((l) => /^\s*\/\/ Property (\d+)\s*$/.exec(l)?.[1])
          .filter((v): v is string => v !== undefined)
          .map(Number),
      );
      expect(numbers.sort((a, b) => a - b)).toEqual([...EXPECTED_NUMBERS[spec]]);
    },
  );
});
