import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isBoundaryAt, type CitationRange } from "../src/boundary";
import { extract } from "../src/citations/extract";
import { segment, segmentWith } from "../src/segment";
import type { InitialOccurrence } from "../src/testing/arb-initial-prose";
import {
  arbBoundaryText,
  arbCitationRanges,
  arbSentencedText,
  arbText,
  arbTextWithCitations,
  arbTieProneFragmentation,
} from "../src/testing/arbitraries";
import type { Origin, Span } from "../src/types";
import { isValidBoundary } from "../src/validate";
import { refAbbreviationEnds, refBoundaries, strictlyInside } from "./support/boundary-model";
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

/**
 * Property 14's input: an `arbSegmentInput` run through `segmentWith` with
 * its hand-placed ranges, or an `arbTextWithCitations` text with an
 * `arbTieProneFragmentation` run through the public `segment`, whose ranges
 * are `extract(text).citations`.
 */
const arbPartitionInput: fc.Arbitrary<SegmentInput & { viaSegment: boolean }> = fc.oneof(
  arbSegmentInput.map((input) => ({ ...input, viaSegment: false })),
  arbTextWithCitations.chain(({ text }) =>
    arbTieProneFragmentation(text).map((spans) => ({
      text,
      spans,
      ranges: extract(text).citations,
      viaSegment: true,
    })),
  ),
);

/** Reference model: every interior Offset the shared predicate accepts, ascending. */
function expectedBoundaries(text: string, ranges: readonly CitationRange[]): number[] {
  const out: number[] = [];
  for (let b = 1; b < text.length; b += 1) if (isBoundaryAt(text, b, ranges)) out.push(b);
  return out;
}

describe("segment and segmentWith partition _Requirements: 8.1, 8.2, 8.8_", () => {
  // Property 14
  it("Property 14: Segmentation is a lossless partition at valid boundaries", () => {
    fc.assert(
      fc.property(arbPartitionInput, ({ text, spans, ranges, viaSegment }) => {
        const result = viaSegment ? segment(text, spans) : segmentWith(text, spans, ranges);
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

const arbBoundaryInput = arbBoundaryText.chain((input) =>
  arbTieProneFragmentation(input.text).map((spans) => ({ ...input, spans })),
);

type BoundaryInput = typeof arbBoundaryInput extends fc.Arbitrary<infer T> ? T : never;

/** Property 15's check of one input against `refBoundaries` and the recorded occurrences. */
function checkBoundaries({ text, spans, abbreviations, initials }: BoundaryInput): void {
  const result = segment(text, spans);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const cits = extract(text).citations;
  const interior = result.value.slice(1).map((s) => s.start);
  const expected = refBoundaries(text, cits);
  expect(interior).toEqual(expected);
  if (text.length > 0 && expected.length === 0) expect(result.value).toHaveLength(1);
  const found = new Set(interior);
  for (const c of cits) expect(interior.filter((b) => c.start < b && b < c.end)).toEqual([]);
  for (const a of abbreviations) {
    expect(text.slice(a.start, a.end)).toBe(a.abbreviation);
    expect(found.has(a.end + 1)).toBe(false);
  }
  for (const o of initials) {
    expect(text.charAt(o.dot)).toBe(".");
    // An initial's label is set inside its spliced piece; a Citation (Req 8.5) or a
    // Legal_Abbreviation (Req 8.6) formed with the surrounding text still excludes it.
    const splits = o.splits && !strictlyInside(o.after, cits) && !refAbbreviationEnds(text, o.dot);
    expect({ kind: o.kind, after: o.after, boundary: found.has(o.after) }).toEqual({
      kind: o.kind,
      after: o.after,
      boundary: splits,
    });
  }
}

/**
 * Shrunk Property 15 counterexamples (seeds -2112387698, -723280868,
 * 409568589): a spliced initial labelled as splitting whose `.` also ends a
 * multi-word Reporter_List entry begun by the base text before it, so Req 8.6
 * excludes the boundary. The shrunk span lists are replaced by one HUM span;
 * the boundaries do not depend on spans.
 */
const initialExample = (
  text: string,
  kind: InitialOccurrence["kind"],
  dot: number,
  after: number,
): BoundaryInput => ({
  text,
  abbreviations: [],
  initials: [{ kind, dot, after, splits: true }],
  spans: [
    {
      start: 0,
      end: text.length,
      provenance: { origin: "HUM", timestamp: "0000-01-01T00:00:00Z" },
    },
  ],
});

const INITIAL_COMPLETES_REPORTER: readonly (readonly [string, BoundaryInput])[] = [
  ["N.Y. Civ. Proc. R.", initialExample("1 N.Y. Civ. Proc. R.  A R. 1", "twoSpaces", 19, 22)],
  [
    "Pa. C.",
    initialExample(
      "1600 Ala. App. LEXIS 1 held 1600 Ala. App. LEXIS 1, at *1 held held See & See & A B. A, Inc. v. A A, 1 Pa. C. v. A D. & C. at 1",
      "vee",
      108,
      110,
    ),
  ],
  [
    "Adv. S.",
    initialExample("1 Ariz. Adv. S.\nA Rep. 1, 1 (D. D. 1600) held held", "newline", 14, 16),
  ],
];

describe("segment boundaries _Requirements: 8.3, 8.4, 8.5, 8.6, 8.10_", () => {
  // Property 15
  // 500 runs take 0.85-1.2 s idle and 5.1-6.9 s with the CPU 2x oversubscribed,
  // past vitest's 5 s default, which a synchronous test only checks once it returns.
  // 60 s is about 9x the loaded worst case and covers a 52.7 s run seen under load.
  it(
    "Property 15: Sentence boundaries are exactly the rule's positions",
    { timeout: 60_000 },
    () => {
      fc.assert(fc.property(arbBoundaryInput, checkBoundaries), runs());
    },
  );

  it.each(INITIAL_COMPLETES_REPORTER)(
    "Property 15 example: an initial completing %s has no boundary after it",
    (_name, input) => {
      checkBoundaries(input);
      const result = segment(input.text, input.spans);
      expect(result.ok && result.value.map((s) => s.start)).not.toContain(input.initials[0]?.after);
    },
  );
});
