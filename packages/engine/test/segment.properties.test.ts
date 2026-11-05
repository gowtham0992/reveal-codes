import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isBoundaryAt, type CitationRange } from "../src/boundary";
import { segmentWith } from "../src/segment";
import {
  arbCitationRanges,
  arbSentencedText,
  arbSpanFragmentation,
  arbText,
} from "../src/testing/arbitraries";
import type { Span } from "../src/types";
import { isValidBoundary } from "../src/validate";
import { runs } from "./support/fc";

/** One segmentation input: text, a covering span list, and citation ranges. */
type SegmentInput = Readonly<{
  text: string;
  spans: readonly Span[];
  ranges: readonly CitationRange[];
}>;

/**
 * `arbText` (plain, or with terminator sequences spliced in so boundaries are
 * common) with spans from `arbSpanFragmentation` and ranges from
 * `arbCitationRanges`. Task 4.6 reuses this for Property 16.
 */
const arbSegmentInput: fc.Arbitrary<SegmentInput> = fc
  .oneof(arbText, arbSentencedText)
  .chain((text) =>
    fc
      .tuple(arbSpanFragmentation(text), arbCitationRanges(text))
      .map(([spans, ranges]) => ({ text, spans, ranges })),
  );

/** Reference model: every interior Offset the shared predicate accepts, ascending. */
function expectedBoundaries(text: string, ranges: readonly CitationRange[]): number[] {
  const out: number[] = [];
  for (let b = 1; b < text.length; b += 1) if (isBoundaryAt(text, b, ranges)) out.push(b);
  return out;
}

describe("segmentWith partition _Requirements: 8.1, 8.2, 8.8_", () => {
  // Property 14
  it("Property 14: Segmentation is a lossless partition at valid boundaries", () => {
    fc.assert(
      fc.property(arbSegmentInput, ({ text, spans, ranges }) => {
        const result = segmentWith(text, spans, ranges);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const sentences = result.value;
        if (text.length === 0) {
          expect(sentences).toEqual([]);
          return;
        }
        let cursor = 0;
        for (const s of sentences) {
          expect(s.start).toBe(cursor);
          expect(s.end).toBeGreaterThan(s.start);
          expect(isValidBoundary(text, s.start)).toBe(true);
          expect(isValidBoundary(text, s.end)).toBe(true);
          cursor = s.end;
        }
        expect(cursor).toBe(text.length);
        expect(sentences.map((s) => text.slice(s.start, s.end)).join("")).toBe(text);
        const interior = sentences.slice(1).map((s) => s.start);
        expect(interior).toEqual(expectedBoundaries(text, ranges));
      }),
      runs(),
    );
  });
});
