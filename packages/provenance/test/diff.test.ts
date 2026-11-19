import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { diffLines } from "../src/core/diff.js";
import { DIFF_CAP } from "../src/core/limits.js";
import { createLineIndex, lineStarts, positionAt, splitLines } from "../src/core/lines.js";
import type { Hunk } from "../src/core/types.js";
import { arbTextPair } from "../src/testing/arbitraries.js";
import { runs } from "./support/fc.js";

/** Applies Hunks from the highest offset to the lowest. */
function applyHunks(text: string, hunks: readonly Hunk[]): string {
  return [...hunks].reverse().reduce((t, h) => t.slice(0, h.from) + h.text + t.slice(h.to), text);
}

function expectOnLineBoundaries(old: string, hunks: readonly Hunk[]): void {
  const starts = new Set([...lineStarts(old), old.length]);
  for (const h of hunks) {
    expect(starts.has(h.from)).toBe(true);
    expect(starts.has(h.to)).toBe(true);
  }
}

describe("diffLines", () => {
  it("gives no Hunk for equal texts", () => {
    expect(diffLines("a\nb\n", "a\nb\n")).toEqual([]);
    expect(diffLines("", "")).toEqual([]);
  });

  it("gives one Hunk for one changed middle line", () => {
    expect(diffLines("a\nb\nc\n", "a\nX\nc\n")).toEqual([{ from: 2, to: 4, text: "X\n" }]);
  });

  it("inserts at the start and at the end", () => {
    expect(diffLines("b\n", "a\nb\n")).toEqual([{ from: 0, to: 0, text: "a\n" }]);
    expect(diffLines("a\n", "a\nb\n")).toEqual([{ from: 2, to: 2, text: "b\n" }]);
  });

  it("deletes all text", () => {
    expect(diffLines("a\nb\n", "")).toEqual([{ from: 0, to: 4, text: "" }]);
  });

  it("keeps the carriage return with its line", () => {
    const old = "a\r\nb\r\nc\r\n";
    const hunks = diffLines(old, "a\r\nX\r\nc\r\n");
    expect(hunks).toEqual([{ from: 3, to: 6, text: "X\r\n" }]);
  });

  it("treats a last line without a newline as a different line from one with it", () => {
    const hunks = diffLines("a\nb", "a\nb\n");
    expect(hunks).toEqual([{ from: 2, to: 3, text: "b\n" }]);
    expect(applyHunks("a\nb", hunks)).toBe("a\nb\n");
  });

  it("never splits a surrogate pair on a changed line", () => {
    const old = "a\n\u{1F600}x\nc\n";
    const next = "a\n\u{1F600}y\nc\n";
    const hunks = diffLines(old, next);
    expect(hunks).toEqual([{ from: 2, to: 6, text: "\u{1F600}y\n" }]);
    expect(applyHunks(old, hunks)).toBe(next);
  });

  it("merges a run of deletes and inserts into one Hunk", () => {
    const hunks = diffLines("a\nb\nc\nd\n", "a\nX\nY\nd\n");
    expect(hunks).toEqual([{ from: 2, to: 6, text: "X\nY\n" }]);
  });

  it("takes the cap path for a rewrite past the cap and still reproduces the new text", () => {
    const n = DIFF_CAP + 1;
    const old = Array.from({ length: n }, (_, i) => `a${String(i)}\n`).join("");
    const next = Array.from({ length: n }, (_, i) => `b${String(i)}\n`).join("");
    const hunks = diffLines(old, next);
    expect(hunks).toEqual([{ from: 0, to: old.length, text: next }]);
    expect(applyHunks(old, hunks)).toBe(next);
  });

  it("reproduces the new text on related pairs, on old line boundaries, sorted and disjoint", () => {
    fc.assert(
      fc.property(arbTextPair, (pair) => {
        const hunks = diffLines(pair.old, pair.new);
        expect(applyHunks(pair.old, hunks)).toBe(pair.new);
        expectOnLineBoundaries(pair.old, hunks);
        hunks.slice(1).forEach((h, i) => {
          expect(h.from).toBeGreaterThan((hunks[i] as Hunk).to);
        });
      }),
      { numRuns: runs(process.env) },
    );
  });
});

describe("lines", () => {
  it("splits after each newline and keeps the carriage return", () => {
    expect(splitLines("a\r\nb\nc")).toEqual(["a\r\n", "b\n", "c"]);
    expect(splitLines("")).toEqual([]);
  });

  it("gives 1-based line and column", () => {
    const index = createLineIndex("ab\ncd\n");
    expect(positionAt(index, 0)).toEqual({ line: 1, column: 1 });
    expect(positionAt(index, 4)).toEqual({ line: 2, column: 2 });
    expect(positionAt(index, 6)).toEqual({ line: 3, column: 1 });
  });

  it("counts a surrogate pair as two columns", () => {
    const index = createLineIndex("\u{1F600}x");
    expect(positionAt(index, 2)).toEqual({ line: 1, column: 3 });
    expect(positionAt(index, 3).column - positionAt(index, 0).column).toBe(3);
  });
});
