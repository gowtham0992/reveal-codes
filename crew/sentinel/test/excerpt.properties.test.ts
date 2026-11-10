import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { excerptPair } from "../src/excerpt.js";
import { arbLinePair } from "./support/arbitraries.js";
import { runs } from "./support/fc.js";

const MAX = 80;
const MARK = "…";

/** True when no surrogate code unit is unpaired. */
function wellFormed(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      i += 1;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return false;
    }
  }
  return true;
}

/** One leading and one trailing "…" removed when present. */
function stripMarks(text: string): string {
  const head = text.startsWith(MARK) ? text.slice(1) : text;
  return head.endsWith(MARK) ? head.slice(0, -1) : head;
}

describe("body_edited excerpts _Requirements: 14.4, 14.5, 14.6_", () => {
  // Property 3
  it("P3 excerpts differ, stay at most 82 long and inside their own lines", () => {
    fc.assert(
      fc.property(arbLinePair, ({ b, a }) => {
        const [before, after] = excerptPair(b, a, MAX);
        expect(before).not.toBe(after);
        expect(before.length).toBeLessThanOrEqual(MAX + 2);
        expect(after.length).toBeLessThanOrEqual(MAX + 2);
        expect(b.includes(stripMarks(before))).toBe(true);
        expect(a.includes(stripMarks(after))).toBe(true);
        if (wellFormed(b) && wellFormed(a)) {
          expect(wellFormed(before)).toBe(true);
          expect(wellFormed(after)).toBe(true);
        }
      }),
      { numRuns: runs(process.env) },
    );
  });
});
