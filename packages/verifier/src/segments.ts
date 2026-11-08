// Ellipsis_Segments: splitting, ordered matching, and the prefix frontier (design A8, A9).

import { indexFrom, longestPrefixOccurring } from "./kmp";

/** Interior segments shorter than this never match (Req 8.14). */
export const SEGMENT_FLOOR = 12;

export type SegmentSpan = {
  /** Start of the trimmed piece. */
  readonly a: number;
  /** End (exclusive) of the trimmed piece. */
  readonly b: number;
  /** Index just after the `…` following the piece, or `b` for the last piece. */
  readonly next: number;
};

export type MatchResult =
  { readonly ok: true } | { readonly ok: false; readonly index: number; readonly pos: number };

/** Split a normalised string on `…`, trim spaces, drop empty pieces. */
export function segmentSpans(s: string): SegmentSpan[] {
  const spans: SegmentSpan[] = [];
  let rawStart = 0;
  while (rawStart <= s.length) {
    const cut = s.indexOf("…", rawStart);
    const rawEnd = cut < 0 ? s.length : cut;
    let a = rawStart;
    let b = rawEnd;
    while (a < b && s[a] === " ") a += 1;
    while (b > a && s[b - 1] === " ") b -= 1;
    if (b > a) spans.push({ a, b, next: cut < 0 ? b : cut + 1 });
    if (cut < 0) break;
    rawStart = cut + 1;
  }
  return spans;
}

/** The segment texts of a normalised string. */
export function splitSegments(s: string): string[] {
  return segmentSpans(s).map((span) => s.slice(span.a, span.b));
}

/**
 * Match segments in order, non-overlapping, against the normalised opinion.
 * Interior segments below the floor fail; first and last are exempt.
 */
export function matchSegments(opinion: string, segs: readonly string[]): MatchResult {
  let pos = 0;
  for (let i = 0; i < segs.length; i += 1) {
    const seg = segs[i] as string;
    const interior = segs.length >= 2 && i > 0 && i < segs.length - 1;
    if (interior && seg.length < SEGMENT_FLOOR) return { ok: false, index: i, pos };
    const j = indexFrom(seg, opinion, pos);
    if (j < 0) return { ok: false, index: i, pos };
    pos = j + seg.length;
  }
  return { ok: true };
}

/**
 * Frontier J*: the largest index into `v` that a clean prefix may reach and still match.
 * `spans` index into `v` (for a single-segment quote, `v` is the tail-trimmed form).
 * Returns 0 when there is no span, or when every segment matches.
 */
export function frontier(
  v: string,
  spans: readonly SegmentSpan[],
  opinion: string,
  single: boolean,
): number {
  const first = spans[0];
  if (first === undefined) return 0;
  if (single) {
    const seg = v.slice(first.a, first.b);
    return first.a + longestPrefixOccurring(seg, opinion, 0);
  }
  const segs = spans.map((span) => v.slice(span.a, span.b));
  const result = matchSegments(opinion, segs);
  if (result.ok) return 0;
  const span = spans[result.index] as SegmentSpan;
  const seg = segs[result.index] as string;
  const p = longestPrefixOccurring(seg, opinion, result.pos);
  return p === seg.length ? span.next : span.a + p;
}
