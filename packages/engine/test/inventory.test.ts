/**
 * Property inventory (spec provenance-engine, task 10.5).
 *
 * Every `### Property N` heading in design.md must be implemented exactly once
 * as a `// Property N` comment followed by one `fc.assert`, in a
 * `*.properties.test.ts` file whose describe title carries `_Requirements:`.
 * No test file may mock an engine module or use the forbidden try statement.
 *
 * _Requirements: 22.2, 22.6_
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDir = fileURLToPath(new URL(".", import.meta.url));
const designPath = join(
  testDir,
  "..",
  "..",
  "..",
  ".kiro",
  "specs",
  "provenance-engine",
  "design.md",
);

/**
 * Documented, user-accepted allowance: Property 43 (the shared arbitraries are
 * valid) is checked arbitrary by arbitrary, so it carries several
 * `// Property 43` markers, each with its own `fc.assert`, in one file. For
 * Property 43 we require at least one marker and at least one `fc.assert`.
 * Every other Property needs exactly one marker with exactly one `fc.assert`.
 */
const MULTI_ASSERT_ALLOWED: ReadonlySet<number> = new Set([43]);

type Marker = {
  readonly n: number;
  readonly file: string;
  readonly asserts: number;
  readonly describeTitle: string | null;
};

const MARKER = /^\s*\/\/ Property (\d+)\s*$/;
const DESCRIBE_AT_TOP = /^describe\(/;
const ASSERT = /\bfc\.assert\(/g;

function listTestFiles(dir: string): readonly string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"))
    .map((f) => join(dir, f))
    .sort();
}

function designPropertyNumbers(): readonly number[] {
  const design = readFileSync(designPath, "utf8");
  return [...design.matchAll(/^### Property (\d+):/gm)].map((m) => Number(m[1]));
}

function enclosingDescribeTitle(lines: readonly string[], at: number): string | null {
  for (let i = at; i >= 0; i--) {
    if (DESCRIBE_AT_TOP.test(lines[i] ?? "")) return lines[i] ?? null;
  }
  return null;
}

/** A marker's block runs to the next marker or the next top-level describe. */
function markersIn(file: string): readonly Marker[] {
  const lines = readFileSync(file, "utf8").split("\n");
  const found: Marker[] = [];
  lines.forEach((line, i) => {
    const m = MARKER.exec(line);
    if (m === null) return;
    let end = i + 1;
    while (
      end < lines.length &&
      !MARKER.test(lines[end] ?? "") &&
      !DESCRIBE_AT_TOP.test(lines[end] ?? "")
    )
      end++;
    const block = lines.slice(i + 1, end).join("\n");
    found.push({
      n: Number(m[1]),
      file: relative(testDir, file),
      asserts: block.match(ASSERT)?.length ?? 0,
      describeTitle: enclosingDescribeTitle(lines, i),
    });
  });
  return found;
}

const allFiles = listTestFiles(testDir);
const propertyFiles = allFiles.filter((f) => f.endsWith(".properties.test.ts"));
const markers = propertyFiles.flatMap(markersIn);
const designNumbers = designPropertyNumbers();

describe("property inventory _Requirements: 22.2_", () => {
  it("finds the design's Property headings, numbered 1..N without gaps", () => {
    expect(designNumbers.length).toBeGreaterThan(0);
    expect(designNumbers).toEqual(designNumbers.map((_, i) => i + 1));
  });

  it("has no marker for a Property the design does not list", () => {
    const unknown = markers
      .filter((m) => !designNumbers.includes(m.n))
      .map((m) => `${m.file}: Property ${String(m.n)}`);
    expect(unknown).toEqual([]);
  });

  it("implements every Property in exactly one place, with the right number of markers", () => {
    const problems: string[] = [];
    for (const n of designNumbers) {
      const mine = markers.filter((m) => m.n === n);
      const files = new Set(mine.map((m) => m.file));
      if (mine.length === 0) problems.push(`Property ${String(n)}: missing`);
      else if (files.size > 1)
        problems.push(`Property ${String(n)}: in several files ${[...files].join(", ")}`);
      else if (mine.length > 1 && !MULTI_ASSERT_ALLOWED.has(n))
        problems.push(`Property ${String(n)}: ${String(mine.length)} markers`);
    }
    expect(problems).toEqual([]);
  });

  it("gives every Property one fc.assert (at least one for the allowed Property 43)", () => {
    const problems: string[] = [];
    for (const n of designNumbers) {
      const total = markers.filter((m) => m.n === n).reduce((sum, m) => sum + m.asserts, 0);
      if (MULTI_ASSERT_ALLOWED.has(n)) {
        if (total < 1) problems.push(`Property ${String(n)}: no fc.assert`);
      } else if (total !== 1) {
        problems.push(`Property ${String(n)}: ${String(total)} fc.assert calls`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("keeps every Property's describe title marked with _Requirements:", () => {
    const bad = markers
      .filter((m) => m.describeTitle === null || !m.describeTitle.includes("_Requirements:"))
      .map((m) => `${m.file}: Property ${String(m.n)}`);
    expect(bad).toEqual([]);
  });
});

describe("test hygiene _Requirements: 22.6_", () => {
  // Patterns are assembled from parts so that this file does not match itself.
  const mockCall = new RegExp("\\bvi\\." + "mock\\(\\s*[\"'`]([^\"'`]+)[\"'`]", "g");
  const tryBlock = new RegExp("\\btr" + "y\\s*\\{");
  const isEngineModule = (spec: string): boolean =>
    spec.startsWith(".") || spec.includes("/src/") || spec.includes("engine");

  it("scans the whole test tree including test/support", () => {
    expect(allFiles.some((f) => relative(testDir, f).startsWith("support"))).toBe(true);
    expect(allFiles.length).toBeGreaterThan(propertyFiles.length);
  });

  it("mocks no engine module", () => {
    const offenders = allFiles.flatMap((f) =>
      [...readFileSync(f, "utf8").matchAll(mockCall)]
        .filter((m) => isEngineModule(m[1] ?? ""))
        .map((m) => `${relative(testDir, f)}: ${m[0]}`),
    );
    expect(offenders).toEqual([]);
  });

  it("uses no try block in any test file", () => {
    const offenders = allFiles
      .filter((f) =>
        readFileSync(f, "utf8")
          .split("\n")
          .some((line) => tryBlock.test(line)),
      )
      .map((f) => relative(testDir, f));
    expect(offenders).toEqual([]);
  });
});
