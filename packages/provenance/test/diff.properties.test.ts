import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { diffLines } from "../src/core/diff.js";
import { lineStarts } from "../src/core/lines.js";
import type { Hunk } from "../src/core/types.js";
import { arbAnyTextPair } from "../src/testing/arbitraries.js";
import { runs } from "./support/fc.js";

/** Applies Hunks (offsets in `old`) from the highest offset to the lowest. */
function applyHunks(old: string, hunks: readonly Hunk[]): string {
  return [...hunks]
    .reverse()
    .reduce((text, h) => text.slice(0, h.from) + h.text + text.slice(h.to), old);
}

/** True when the Hunks are sorted, disjoint, in range and on line boundaries of `old`. */
function wellFormed(old: string, hunks: readonly Hunk[]): boolean {
  const boundaries = new Set([...lineStarts(old), old.length]);
  return hunks.every((h, i) => {
    const prev = hunks[i - 1];
    return (
      h.from <= h.to &&
      h.to <= old.length &&
      boundaries.has(h.from) &&
      boundaries.has(h.to) &&
      (prev === undefined || prev.to <= h.from)
    );
  });
}

describe("diff properties _Requirements: 4.2, 4.3_", () => {
  // Property 7
  it("P7 hunks reproduce the new text", () => {
    fc.assert(
      fc.property(arbAnyTextPair, ({ old, new: next }) => {
        const hunks = diffLines(old, next);
        const total = hunks.reduce((n, h) => n + h.text.length + (h.to - h.from), 0);
        expect(wellFormed(old, hunks)).toBe(true);
        expect(applyHunks(old, hunks)).toBe(next);
        expect(hunks.length === 0).toBe(old === next);
        expect(total).toBeLessThanOrEqual(old.length + next.length);
      }),
      { numRuns: runs(process.env) },
    );
  });
});
