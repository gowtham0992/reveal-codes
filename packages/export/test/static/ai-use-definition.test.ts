import { readFileSync, readdirSync, existsSync } from "node:fs";
import { basename, join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  PACKAGE_ROOT,
  at,
  format,
  lineOf,
  walk,
  type Source,
  type Violation,
} from "../support/scan.js";

const REPO_ROOT = join(PACKAGE_ROOT, "..", "..");
const SKIPPED_DIRS = new Set(["node_modules", ".next", "dist", "coverage"]);
const CODE = /\.(ts|tsx)$/;

function readTree(dir: string, accept: RegExp): Source[] {
  if (!existsSync(dir)) return [];
  const out: Source[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) out.push(...readTree(path, accept));
    } else if (accept.test(entry.name)) {
      out.push({ path, text: readFileSync(path, "utf8") });
    }
  }
  return out;
}

function packageSrcDirs(): string[] {
  const packages = join(REPO_ROOT, "packages");
  return readdirSync(packages).map((p) => join(packages, p, "src"));
}

const SRC_DIRS = [
  ...packageSrcDirs(),
  join(REPO_ROOT, "apps", "web", "src"),
  join(REPO_ROOT, "crew", "sentinel", "src"),
];
const CODE_SOURCES = SRC_DIRS.flatMap((d) => readTree(d, CODE));
const WORDING_SOURCES = [
  ...SRC_DIRS.filter((d) => !d.includes(join("crew", "sentinel"))).flatMap((d) =>
    readTree(d, /\.[a-z]+$/),
  ),
  ...readTree(join(REPO_ROOT, "docs"), /\.[a-z]+$/),
];

const DEFINITION_FILE = "declaration.ts";
// isAiSpan: defined in statement-parts.ts, read by declaration.ts (the single AI-use definition)
// and by ai-paragraphs.ts (which lists the AI passages for the Appendix, not AI use).
const IS_AI_SPAN_FILES = ["declaration.ts", "statement-parts.ts", "ai-paragraphs.ts"];
const REMOVED_STRINGS = [
  "No generative artificial intelligence was used",
  "No program was used.",
  "states that no program was used",
  "no generative artificial intelligence program was used in the editor",
];

function parseAny(file: Source): ts.SourceFile {
  const kind = file.path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(file.path, file.text, ts.ScriptTarget.ES2022, true, kind);
}

function isNamed(n: ts.Node, name: string): boolean {
  return (
    (ts.isFunctionDeclaration(n) || ts.isVariableDeclaration(n)) &&
    n.name !== undefined &&
    ts.isIdentifier(n.name) &&
    n.name.text === name
  );
}

function definitions(file: Source, name: string): Violation[] {
  if (!file.text.includes(name)) return [];
  const sf = parseAny(file);
  const out: Violation[] = [];
  walk(sf, (n) => {
    if (isNamed(n, name)) out.push(at(file, lineOf(sf, n), `definition of ${name}`));
  });
  return out;
}

function identifierUses(file: Source, name: string, allowed: readonly string[]): Violation[] {
  if (allowed.includes(basename(file.path))) return [];
  if (!file.text.includes(name)) return [];
  const sf = parseAny(file);
  const out: Violation[] = [];
  walk(sf, (n) => {
    if (ts.isIdentifier(n) && n.text === name) {
      out.push(at(file, lineOf(sf, n), `${name} outside ${allowed.join(", ")}`));
    }
  });
  return out;
}

function stringUses(file: Source, needles: readonly string[]): Violation[] {
  return file.text
    .split("\n")
    .flatMap((text, i) =>
      needles.filter((s) => text.includes(s)).map((s) => at(file, i + 1, `removed wording "${s}"`)),
    );
}

describe("single definition of AI use _Requirements: 1.3, 6.1_", () => {
  it("self-test: a second usedAi definition is reported with file:line", () => {
    const planted = { path: "other.ts", text: "const a = 1;\nexport function usedAi() {}\n" };
    expect(format(definitions(planted, "usedAi"))).toEqual(["other.ts:2 definition of usedAi"]);
    const arrow = { path: "arrow.ts", text: "export const usedAi = () => true;\n" };
    expect(format(definitions(arrow, "usedAi"))).toEqual(["arrow.ts:1 definition of usedAi"]);
  });

  it("usedAi is defined exactly once, in declaration.ts", () => {
    const found = CODE_SOURCES.flatMap((f) => definitions(f, "usedAi"));
    expect(found.map((v) => basename(v.file))).toEqual([DEFINITION_FILE]);
    expect(found[0]?.file).toBe(join(PACKAGE_ROOT, "src", DEFINITION_FILE));
  });

  it("self-test: a planted isAiSpan read outside the allowlist is reported", () => {
    const planted = { path: "other.ts", text: "const a = 1;\nspans.some(isAiSpan);\n" };
    expect(format(identifierUses(planted, "isAiSpan", IS_AI_SPAN_FILES))).toEqual([
      "other.ts:2 isAiSpan outside declaration.ts, statement-parts.ts, ai-paragraphs.ts",
    ]);
    const allowed = { path: "ai-paragraphs.ts", text: "spans.some(isAiSpan);" };
    expect(identifierUses(allowed, "isAiSpan", IS_AI_SPAN_FILES)).toEqual([]);
  });

  it("isAiSpan is read only in declaration.ts, statement-parts.ts and ai-paragraphs.ts", () => {
    const found = CODE_SOURCES.flatMap((f) => identifierUses(f, "isAiSpan", IS_AI_SPAN_FILES));
    expect(format(found)).toEqual([]);
  });

  it("self-test: planted removed wording is reported with file:line", () => {
    const planted = { path: "x.md", text: "ok\nThe author states that no program was used.\n" };
    expect(format(stringUses(planted, REMOVED_STRINGS))).toEqual([
      'x.md:2 removed wording "states that no program was used"',
    ]);
  });

  it("the old no-AI strings appear nowhere under packages/*/src, apps/web/src or docs/", () => {
    expect(WORDING_SOURCES.length).toBeGreaterThan(0);
    expect(format(WORDING_SOURCES.flatMap((f) => stringUses(f, REMOVED_STRINGS)))).toEqual([]);
  });
});
