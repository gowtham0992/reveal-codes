import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { LEGAL_ABBREVIATIONS } from "../src/abbreviations";
import { isBoundaryAt, type CitationRange } from "../src/boundary";
import { extract } from "../src/citations/extract";
import { REPORTERS } from "../src/citations/reporters";
import { segment, segmentWith } from "../src/segment";
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

const WS = /\s/;
const CLOSERS = new Set(['"', "”", "'", "’", ")"]);
const TERMINATORS = new Set([".", "?", "!"]);

/** The Glossary's Legal_Abbreviations: the fixed list plus every Reporter_List entry. */
const ALL_ABBREVIATIONS: ReadonlySet<string> = new Set([...LEGAL_ABBREVIATIONS, ...REPORTERS]);
const PERIOD_ABBREVIATIONS = [...ALL_ABBREVIATIONS].filter((a) => a.endsWith("."));

/** Reference Req 8.3: the index of the terminator run's last unit before `b`, or -1. */
function refTerminatorEnd(text: string, b: number): number {
  if (WS.test(text.charAt(b)) || !WS.test(text.charAt(b - 1))) return -1;
  let i = b - 1;
  while (i >= 0 && WS.test(text.charAt(i))) i -= 1;
  while (i >= 0 && CLOSERS.has(text.charAt(i))) i -= 1;
  return i >= 0 && TERMINATORS.has(text.charAt(i)) ? i : -1;
}

/** Reference Req 8.6: `text[i]` ends a Legal_Abbreviation preceded by start, whitespace, or `(`. */
function refAbbreviationEnds(text: string, i: number): boolean {
  return PERIOD_ABBREVIATIONS.some((a) => {
    const s = i - a.length + 1;
    if (s < 0 || text.slice(s, i + 1) !== a) return false;
    return s === 0 || WS.test(text.charAt(s - 1)) || text.charAt(s - 1) === "(";
  });
}

/** Reference Glossary Capitalised_Word. */
function refIsCapitalisedWord(word: string): boolean {
  if (/^\p{Lu}[\p{L}0-9'’-]*$/u.test(word) || /^[A-Z]\.$/.test(word)) return true;
  return word !== "v." && ALL_ABBREVIATIONS.has(word);
}

const W_RUN = /[\p{L}0-9.'’-]*/uy;

/** Reference Req 8.10: `text[i]` is an initial's `.` before one space and a Capitalised_Word other than `Id.`. */
function refInitialExcluded(text: string, i: number): boolean {
  if (text.charAt(i) !== "." || !/^[A-Z]$/.test(text.charAt(i - 1))) return false;
  if (i >= 2 && text.charAt(i - 2) !== " ") return false;
  if (text.charAt(i + 1) !== " ") return false;
  W_RUN.lastIndex = i + 2;
  const word = W_RUN.exec(text)?.[0] ?? "";
  return word !== "Id." && refIsCapitalisedWord(word);
}

const strictlyInside = (b: number, ranges: readonly CitationRange[]): boolean =>
  ranges.some((r) => r.start < b && b < r.end);

/** Reference model of Req 8.3, 8.5, 8.6, and 8.10: every interior boundary, ascending. */
function refBoundaries(text: string, ranges: readonly CitationRange[]): number[] {
  const out: number[] = [];
  for (let b = 1; b < text.length; b += 1) {
    const i = refTerminatorEnd(text, b);
    if (i < 0 || strictlyInside(b, ranges)) continue;
    if (refAbbreviationEnds(text, i) || refInitialExcluded(text, i)) continue;
    out.push(b);
  }
  return out;
}

const arbBoundaryInput = arbBoundaryText.chain((input) =>
  arbTieProneFragmentation(input.text).map((spans) => ({ ...input, spans })),
);

describe("segment boundaries _Requirements: 8.3, 8.4, 8.5, 8.6, 8.10_", () => {
  // Property 15
  it("Property 15: Sentence boundaries are exactly the rule's positions", () => {
    fc.assert(
      fc.property(arbBoundaryInput, ({ text, spans, abbreviations, initials }) => {
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
          const splits = o.splits && !strictlyInside(o.after, cits);
          expect({ kind: o.kind, after: o.after, boundary: found.has(o.after) }).toEqual({
            kind: o.kind,
            after: o.after,
            boundary: splits,
          });
        }
      }),
      runs(),
    );
  });
});
