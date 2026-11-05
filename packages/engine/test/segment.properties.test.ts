import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isBoundaryAt, type CitationRange } from "../src/boundary";
import { segmentWith } from "../src/segment";
import {
  arbCitationRanges,
  arbSentencedText,
  arbText,
  arbTieProneFragmentation,
} from "../src/testing/arbitraries";
import type { Origin, Span } from "../src/types";
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
 * common) with spans from `arbTieProneFragmentation` (an
 * `arbSpanFragmentation`, half the time over an alternating block labelling
 * so Dominant_Origin ties are common) and ranges from `arbCitationRanges`.
 * Shared by Properties 14 and 16.
 */
const arbSegmentInput: fc.Arbitrary<SegmentInput> = fc
  .oneof(arbText, arbSentencedText)
  .chain((text) =>
    fc
      .tuple(arbTieProneFragmentation(text), arbCitationRanges(text))
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

const ORIGIN_ORDER: readonly Origin[] = ["HUM", "PST", "AI", "AI>HUM"];

/** For each code unit of the text, the covering span's Origin and start. */
function unitLabels(spans: readonly Span[]): { origin: Origin; spanStart: number }[] {
  const units: { origin: Origin; spanStart: number }[] = [];
  for (const s of spans)
    for (let u = s.start; u < s.end; u += 1)
      units[u] = { origin: s.provenance.origin, spanStart: s.start };
  return units;
}

/**
 * Reference model (Req 8.7): count code units per Origin in [start, end),
 * take the maximum, break ties by the earliest-starting span among the tied
 * Origins, and list present Origins in the fixed order.
 */
function expectedOrigins(
  units: readonly { origin: Origin; spanStart: number }[],
  start: number,
  end: number,
): { dominantOrigin: Origin | undefined; origins: Origin[] } {
  const count = new Map<Origin, number>();
  const earliest = new Map<Origin, number>();
  for (let u = start; u < end; u += 1) {
    const label = units[u];
    if (label === undefined) continue;
    count.set(label.origin, (count.get(label.origin) ?? 0) + 1);
    earliest.set(label.origin, Math.min(earliest.get(label.origin) ?? Infinity, label.spanStart));
  }
  const origins = ORIGIN_ORDER.filter((o) => count.has(o));
  const max = Math.max(...origins.map((o) => count.get(o) ?? 0));
  const tied = origins.filter((o) => count.get(o) === max);
  tied.sort((a, b) => (earliest.get(a) ?? 0) - (earliest.get(b) ?? 0));
  return { dominantOrigin: tied[0], origins };
}

describe("segmentWith origins _Requirements: 8.7_", () => {
  // Property 16
  it("Property 16: Dominant origin and origin set match a per-unit count", () => {
    fc.assert(
      fc.property(arbSegmentInput, ({ text, spans, ranges }) => {
        const result = segmentWith(text, spans, ranges);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const units = unitLabels(spans);
        for (const s of result.value) {
          const expected = expectedOrigins(units, s.start, s.end);
          expect(expected.dominantOrigin).toBeDefined();
          expect({ dominantOrigin: s.dominantOrigin, origins: s.origins }).toEqual(expected);
        }
      }),
      runs(),
    );
  });
});
