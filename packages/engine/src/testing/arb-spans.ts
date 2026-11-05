/**
 * Span-list arbitraries (design "Arbitraries" table, Properties 3, 4, 5,
 * 14, 16; Req 22.1, 22.4). Built only from fast-check combinators. Cut
 * points are snapped left off Surrogate_Pair interiors with `.map`, so
 * shrinking still works and every span boundary is a Valid_Boundary.
 */
import fc from "fast-check";
import type { InvalidSpans } from "../errors.js";
import { spanIndexAt } from "../spans.js";
import type { Provenance, Span } from "../types.js";
import { isValidBoundary } from "../validate.js";
import { arbText, arbTimestamp } from "./arb-text.js";

type Label = Readonly<{ origin: "HUM" | "PST" } | { origin: "AI" | "AI>HUM"; runId: string }>;

/** A small pool, so adjacent pieces are often Mergeable. */
const arbLabel: fc.Arbitrary<Label> = fc.oneof(
  fc.constantFrom<Label>({ origin: "HUM" }, { origin: "PST" }),
  fc.record({
    origin: fc.constantFrom("AI" as const, "AI>HUM" as const),
    runId: fc.constantFrom("r1", "r2", "r[1]", "a\\b"),
  }),
);

const MAX_CUTS = 32;

/** Distinct, sorted cut points in (0, length), each a Valid_Boundary of `text`. */
function arbCuts(text: string, maxLength: number): fc.Arbitrary<readonly number[]> {
  if (text.length < 2) return fc.constant([]);
  return fc.array(fc.integer({ min: 1, max: text.length - 1 }), { maxLength }).map((cuts) => {
    const snapped = cuts.map((c) => (isValidBoundary(text, c) ? c : c - 1)).filter((c) => c > 0);
    return [...new Set(snapped)].sort((a, b) => a - b);
  });
}

/** Pieces [0, c1), [c1, c2), ..., [ck, length); none when `length` is 0. */
function pieces(length: number, cuts: readonly number[]): readonly (readonly [number, number])[] {
  if (length === 0) return [];
  const bounds = [0, ...cuts, length];
  return bounds.slice(1).map((end, i) => [bounds[i] ?? 0, end] as const);
}

const withTimestamp = (label: Label, timestamp: string): Provenance => ({ ...label, timestamp });

/**
 * A per-code-unit labelling of Origin and Run_Id, as a valid span list
 * (Coverage_Invariant holds) over `text`. Adjacent spans may be Mergeable.
 */
export function arbLabelling(text: string): fc.Arbitrary<readonly Span[]> {
  return fc
    .tuple(
      arbCuts(text, MAX_CUTS),
      fc.array(arbLabel, { minLength: MAX_CUTS + 1, maxLength: MAX_CUTS + 1 }),
      arbTimestamp,
    )
    .map(([cuts, labels, timestamp]) =>
      pieces(text.length, cuts).map(([start, end], i) => ({
        start,
        end,
        provenance: withTimestamp(labels[i] ?? { origin: "HUM" }, timestamp),
      })),
    );
}

const labelOf = (p: Provenance): Label =>
  p.runId === undefined || (p.origin !== "AI" && p.origin !== "AI>HUM")
    ? { origin: p.origin === "PST" ? "PST" : "HUM" }
    : { origin: p.origin, runId: p.runId };

/**
 * A valid, usually non-canonical span list over `text`: the given
 * labelling (or a generated one) cut at extra Valid_Boundaries, with
 * Timestamps cycled from a pool of 1 to 4, so adjacent Mergeable spans
 * usually carry different Timestamps. Every code unit keeps the Origin and
 * Run_Id the labelling gives it.
 */
export function arbSpanFragmentation(
  text: string,
  labelling?: readonly Span[],
): fc.Arbitrary<readonly Span[]> {
  const base = labelling === undefined ? arbLabelling(text) : fc.constant(labelling);
  const stamps = fc.array(arbTimestamp, { minLength: 1, maxLength: 4 });
  return fc.tuple(base, arbCuts(text, MAX_CUTS), stamps).map(([spans, extra, pool]) => {
    const cuts = [...new Set([...spans.slice(1).map((s) => s.start), ...extra])];
    cuts.sort((a, b) => a - b);
    return pieces(text.length, cuts).map(([start, end], i) => {
      const covering = spans[spanIndexAt(spans, start)];
      const label =
        covering === undefined ? { origin: "HUM" as const } : labelOf(covering.provenance);
      return { start, end, provenance: withTimestamp(label, pool[i % pool.length] ?? "") };
    });
  });
}

/** Cut points every `width` code units, snapped left off Surrogate_Pair interiors. */
function blockCuts(text: string, width: number): readonly number[] {
  const cuts: number[] = [];
  for (let c = width; c < text.length; c += width) {
    const snapped = isValidBoundary(text, c) ? c : c - 1;
    if (snapped > (cuts[cuts.length - 1] ?? 0)) cuts.push(snapped);
  }
  return cuts;
}

/**
 * A labelling of `text` in equal-width blocks (1 to 4 code units, except
 * where a block edge is snapped off a Surrogate_Pair) alternating between
 * two labels of different Origins, so Sentences often hold equal counts of
 * two Origins.
 */
function arbBlockLabelling(text: string): fc.Arbitrary<readonly Span[]> {
  return fc
    .tuple(
      fc.integer({ min: 1, max: 4 }),
      fc.tuple(arbLabel, arbLabel).filter(([a, b]) => a.origin !== b.origin),
      arbTimestamp,
    )
    .map(([width, [a, b], timestamp]) =>
      pieces(text.length, blockCuts(text, width)).map(([start, end], i) => ({
        start,
        end,
        provenance: withTimestamp(i % 2 === 0 ? a : b, timestamp),
      })),
    );
}

/**
 * `arbSpanFragmentation` over either a free labelling or an equal-width
 * block labelling. The block half makes Dominant_Origin ties common
 * (Property 16); every value is still a valid fragmentation of `text`.
 */
export function arbTieProneFragmentation(text: string): fc.Arbitrary<readonly Span[]> {
  return fc.oneof(
    arbSpanFragmentation(text),
    arbBlockLabelling(text).chain((labelling) => arbSpanFragmentation(text, labelling)),
  );
}

/**
 * A corrupted span list over `text`, with the `invalid_spans` error that
 * `checkCoverage` must report, recorded at generation time.
 */
export type SpanCorruption = Readonly<{
  text: string;
  spans: readonly Span[];
  expected: InvalidSpans;
}>;

type Base = Readonly<{ text: string; spans: readonly Span[]; provenance: Provenance }>;

const span = (start: number, end: number, provenance: Provenance): Span => ({
  start,
  end,
  provenance,
});

/** End of span `i - 1`, or 0: the coverage cursor when span `i` is checked. */
const cursorAt = (spans: readonly Span[], i: number): number =>
  i === 0 ? 0 : (spans[i - 1]?.end ?? 0);

/** `spans[0..i)`, then `bad`, then the rest from `from`. */
const splice = (spans: readonly Span[], i: number, bad: Span, from: number): readonly Span[] => [
  ...spans.slice(0, i),
  bad,
  ...spans.slice(from),
];

const corrupt = (
  b: Base,
  spans: readonly Span[],
  offset: number,
  violation: InvalidSpans["violation"],
): SpanCorruption => ({
  text: b.text,
  spans,
  expected: { kind: "invalid_spans", offset, violation },
});

/** A span with end ≤ start inserted before span `i`: `empty` at its start. */
function arbEmpty(b: Base): fc.Arbitrary<SpanCorruption> {
  const n = b.spans.length;
  return fc
    .tuple(fc.nat({ max: n }), fc.nat({ max: b.text.length + 4 }), fc.nat({ max: 3 }))
    .map(([i, start, back]) => {
      const bad = span(start, start - back, b.provenance);
      return corrupt(b, splice(b.spans, i, bad, i), start, "empty");
    });
}

/** A span starting inside span `i`, inserted after it: `overlap` at its start. */
function arbOverlap(b: Base): fc.Arbitrary<SpanCorruption> {
  return fc
    .tuple(fc.nat({ max: b.spans.length - 1 }), fc.nat(), fc.integer({ min: 1, max: 4 }))
    .map(([i, k, len]) => {
      const s = b.spans[i] ?? span(0, 1, b.provenance);
      const start = s.start + (k % (s.end - s.start));
      return corrupt(
        b,
        splice(b.spans, i + 1, span(start, start + len, b.provenance), i + 1),
        start,
        "overlap",
      );
    });
}

/** A span starting before span `i`'s start (`i ≥ 1`), inserted after it: `unsorted`. */
function arbUnsorted(b: Base): fc.Arbitrary<SpanCorruption> {
  return fc
    .tuple(
      fc.integer({ min: 1, max: b.spans.length - 1 }),
      fc.nat(),
      fc.integer({ min: 1, max: 4 }),
    )
    .map(([i, k, len]) => {
      const prevStart = b.spans[i]?.start ?? 1;
      const start = k % prevStart;
      return corrupt(
        b,
        splice(b.spans, i + 1, span(start, start + len, b.provenance), i + 1),
        start,
        "unsorted",
      );
    });
}

/** Span `i` (or a span appended at the end) starts past the cursor: `gap` at the cursor. */
function arbGap(b: Base): fc.Arbitrary<SpanCorruption> {
  const n = b.spans.length;
  return fc
    .tuple(fc.nat({ max: n }), fc.integer({ min: 1, max: 8 }), fc.integer({ min: 1, max: 8 }))
    .map(([i, d, len]) => {
      const c = cursorAt(b.spans, i);
      const bad = span(c + d, c + d + len, b.provenance);
      return corrupt(b, splice(b.spans, i, bad, i + 1), c, "gap");
    });
}

/** A span with a negative or fractional bound replaces span `i`: `coverage` at the cursor. */
function arbBadBound(b: Base): fc.Arbitrary<SpanCorruption> {
  const n = b.spans.length;
  return fc
    .tuple(
      fc.nat({ max: n }),
      fc.integer({ min: 1, max: 8 }),
      fc.constantFrom("negative", "fraction-start", "fraction-end"),
    )
    .map(([i, d, how]) => {
      const c = cursorAt(b.spans, i);
      const bounds: Record<typeof how, readonly [number, number]> = {
        negative: [-d, c + d],
        "fraction-start": [c + 0.5, c + d],
        "fraction-end": [c, c + d - 0.5],
      };
      const [start, end] = bounds[how];
      return corrupt(b, splice(b.spans, i, span(start, end, b.provenance), i + 1), c, "coverage");
    });
}

/** Wrong total: the spans stop early (`coverage` at the cursor) or run past the end (at the length). */
function arbWrongTotal(b: Base): fc.Arbitrary<SpanCorruption> {
  const len = b.text.length;
  const past = fc
    .integer({ min: 1, max: 8 })
    .map((d) => corrupt(b, [...b.spans, span(len, len + d, b.provenance)], len, "coverage"));
  if (b.spans.length === 0) return past;
  const short = fc
    .nat({ max: b.spans.length - 1 })
    .map((i) => corrupt(b, b.spans.slice(0, i), cursorAt(b.spans, i), "coverage"));
  return fc.oneof(past, short);
}

/** The corruptions that apply to `b`: overlap needs a span, unsorted needs two. */
function corruptions(b: Base): fc.Arbitrary<SpanCorruption> {
  const always = [arbEmpty(b), arbGap(b), arbBadBound(b), arbWrongTotal(b)];
  const n = b.spans.length;
  const some = n >= 1 ? [arbOverlap(b)] : [];
  const many = n >= 2 ? [arbUnsorted(b)] : [];
  return fc.oneof(...always, ...some, ...many);
}

const arbBase: fc.Arbitrary<Base> = arbText.chain((text) =>
  fc.tuple(arbSpanFragmentation(text), arbLabel, arbTimestamp).map(([spans, label, timestamp]) => ({
    text,
    spans,
    provenance: withTimestamp(label, timestamp),
  })),
);

/**
 * A valid fragmentation of an `arbText` string with exactly one fault: an
 * empty span, an overlap, an unsorted span, a gap, a malformed bound, or a
 * wrong total. Spans before the fault are valid, so the recorded error is
 * the first one `checkCoverage` reports (spans.ts check order).
 */
export const arbSpanCorruption: fc.Arbitrary<SpanCorruption> = arbBase.chain(corruptions);
