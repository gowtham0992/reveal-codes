import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WEB_ROOT } from "../support/scan";

const REPO_ROOT = join(WEB_ROOT, "..", "..");

/** Where each of the nineteen properties lives (design D9, "Testing Strategy"). */
const OWNERS: Readonly<Record<string, readonly number[]>> = {
  "packages/engine/test/case-match.properties.test.ts": [2, 3, 4, 5, 6, 7, 8, 19],
  "packages/verifier/test/case-match.properties.test.ts": [1, 9, 10, 11, 12, 13, 18],
  "apps/web/test/case-match.properties.test.ts": [16, 17],
  "packages/export/test/case-match.properties.test.ts": [14],
  "crew/sentinel/test/case-match.properties.test.ts": [15],
};

const MARKER = /^\s*\/\/ Property (\d+)\s*$/;

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

/** Property numbers marked in `text`, in file order. */
export function markersOf(text: string): number[] {
  return text.split("\n").flatMap((line) => {
    const n = MARKER.exec(line)?.[1];
    return n === undefined ? [] : [Number(n)];
  });
}

/** For each marker, the number of `fc.assert(` calls between it and the next marker (or the end). */
export function assertsPerMarker(text: string): number[] {
  const lines = text.split("\n");
  const at = lines.flatMap((l, i) => (MARKER.test(l) ? [i] : []));
  return at.map((start, k) => {
    const end = at[k + 1] ?? lines.length;
    return lines.slice(start + 1, end).filter((l) => /\bfc\.assert\(/.test(l)).length;
  });
}

const files = Object.entries(OWNERS).map(([path, expected]) => ({
  path,
  expected,
  text: read(path),
}));

describe("case-match property inventory _Requirements: 13.1, 13.9_", () => {
  it("self-test: planted markers are counted and a doubled assert is reported", () => {
    const planted = "// Property 4\nfc.assert(a);\n// Property 5\nfc.assert(b);\nfc.assert(c);\n";
    expect(markersOf(planted)).toEqual([4, 5]);
    expect(assertsPerMarker(planted)).toEqual([1, 2]);
  });

  it("the design lists exactly nineteen headings, Property 1 to 19", () => {
    const design = read(".kiro/specs/case-match/design.md");
    const heads = [...design.matchAll(/^### Property (\d+):/gm)].map((m) => Number(m[1]));
    expect(heads).toEqual(Array.from({ length: 19 }, (_, i) => i + 1));
  });

  it("the table assigns each of 1 to 19 to exactly one package", () => {
    const all = Object.values(OWNERS)
      .flat()
      .sort((a, b) => a - b);
    expect(all).toEqual(Array.from({ length: 19 }, (_, i) => i + 1));
  });

  it("each package file holds exactly its assigned markers, once each", () => {
    for (const f of files) {
      expect(
        markersOf(f.text).sort((a, b) => a - b),
        f.path,
      ).toEqual([...f.expected]);
    }
  });

  it("all nineteen markers appear exactly once across the five files", () => {
    const all = files.flatMap((f) => markersOf(f.text)).sort((a, b) => a - b);
    expect(all).toEqual(Array.from({ length: 19 }, (_, i) => i + 1));
  });

  it("each marker is followed by exactly one fc.assert before the next marker", () => {
    for (const f of files) {
      expect(assertsPerMarker(f.text), f.path).toEqual(f.expected.map(() => 1));
    }
  });

  it("ends every describe title with _Requirements: x.y_", () => {
    for (const f of files) {
      const titles = [...f.text.matchAll(/\bdescribe\(\s*"([^"]*)"/g)].map((m) => m[1] ?? "");
      expect(titles.length, f.path).toBeGreaterThan(0);
      for (const title of titles) {
        expect(title, f.path).toMatch(/_Requirements: [\d.]+(, [\d.]+)*_$/);
      }
    }
  });
});
