// checkQuote and prefixLength (design A8, A9; Req 8.1, 8.6 to 8.9, 8.15).

import type { QuoteCheckResult } from "@reveal-codes/engine";
import {
  ELLIPSIS,
  WS_CLASS,
  foldCase,
  matchedBrackets,
  normalise,
  normaliseQuote,
  pipeline,
  trimTail,
} from "./normalise";
import { SEGMENT_FLOOR, frontier, matchSegments, segmentSpans, splitSegments } from "./segments";
import { trackQuote, trimmedEnds, unitCounts } from "./track";
import type { Tracked } from "./track";

/** Most verified probes `prefixLength` may spend (design A9, L2). */
export const MAX_PROBES = 64;

const WS_UNIT = new RegExp(`^[${WS_CLASS}]$`);
const COMBINING = /^[\p{M}\u1160-\u11FF]$/u;

function mismatch(prefixLength: number): QuoteCheckResult {
  return { status: "mismatch", prefixLength };
}

/** The definition of P(n) tested with `matchSegments` (the verified probe). */
function probe(quote: string, n: number, opinion: string, single: boolean): boolean {
  const prefix = quote.slice(0, n);
  const normal = single ? normaliseQuote(prefix) : foldCase(pipeline(prefix));
  const segs = splitSegments(normal);
  return segs.length >= 1 && matchSegments(opinion, segs).ok;
}

/** Cuts where P(n) may not be a prefix of the folded normal form, with the region start. */
function dirtyCuts(quote: string): Map<number, number> {
  const cuts = new Map<number, number>();
  const add = (n: number, rs: number): void => {
    const cur = cuts.get(n);
    if (cur === undefined || rs < cur) cuts.set(n, rs);
  };
  for (const [open, close] of matchedBrackets(quote)) {
    for (let n = open + 1; n <= close; n += 1) add(n, open);
  }
  for (const m of quote.matchAll(ELLIPSIS)) {
    for (let n = m.index + 1; n < m.index + m[0].length; n += 1) add(n, m.index);
  }
  for (let n = 1; n < quote.length; n += 1) {
    const code = quote.charCodeAt(n);
    const lowSurrogate = code >= 0xdc00 && code <= 0xdfff;
    const cp = quote.codePointAt(n);
    const combining = cp !== undefined && COMBINING.test(String.fromCodePoint(cp));
    if (lowSurrogate || combining) add(n, n - 1);
  }
  return cuts;
}

function trackedLength(quote: string, opinion: string, single: boolean, tr: Tracked): number {
  const src = single ? trimTail(tr.v) : tr.v;
  const spans = segmentSpans(src);
  const first = spans[0];
  if (first === undefined) return 0;
  const jStar = frontier(src, spans, opinion, single);
  const kOf = unitCounts(tr.origin, quote.length);
  const ends = trimmedEnds(tr.v, single);
  const dirty = dirtyCuts(quote);
  const endAt = (n: number): number => ends[kOf[n] as number] as number;
  let budget = MAX_PROBES;
  for (let n = quote.length - 1; n >= 1; n -= 1) {
    const rs = dirty.get(n);
    const eligible =
      rs === undefined ? endAt(n) > first.a && endAt(n) <= jStar : endAt(rs) <= jStar;
    if (!eligible) continue;
    if (budget === 0) return 0;
    budget -= 1;
    if (probe(quote, n, opinion, single)) return n;
  }
  return 0;
}

/** Candidate cuts when tracking is abandoned: before White_Space, and after ellipsis forms. */
function wordEndCuts(quote: string): number[] {
  const cuts = new Set<number>();
  for (let n = 1; n < quote.length; n += 1) {
    if (WS_UNIT.test(quote.charAt(n))) cuts.add(n);
  }
  for (const m of quote.matchAll(ELLIPSIS)) {
    const end = m.index + m[0].length;
    if (end < quote.length) cuts.add(end);
  }
  return [...cuts].sort((a, b) => b - a);
}

function untrackedLength(quote: string, opinion: string, single: boolean): number {
  let budget = MAX_PROBES;
  for (const n of wordEndCuts(quote)) {
    if (budget === 0) return 0;
    budget -= 1;
    if (probe(quote, n, opinion, single)) return n;
  }
  return 0;
}

/**
 * The largest n, 0 <= n < quote.length, whose normalised prefix still matches (Req 8.15).
 * `opinion` is already normalised; `single` says the quote has one segment.
 */
export function prefixLength(quote: string, opinion: string, single: boolean): number {
  const tr = trackQuote(quote);
  return tr === null
    ? untrackedLength(quote, opinion, single)
    : trackedLength(quote, opinion, single, tr);
}

/** Check a quotation against opinion text. Never returns `unchecked` (Req 8.9). */
export function checkQuote(opinionText: string, quote: string): QuoteCheckResult {
  const segs = splitSegments(normaliseQuote(quote));
  const first = segs[0];
  if (first === undefined) return mismatch(0);
  const opinion = normalise(opinionText);
  if (matchSegments(opinion, segs).ok) return { status: "match" };
  if (segs.length === 1 && first.length < SEGMENT_FLOOR) return mismatch(0);
  return mismatch(prefixLength(quote, opinion, segs.length === 1));
}
