/**
 * Quote layer: pairing quotation marks and attaching each Quotation_Pair to
 * at most one Citation (Req 13.1, 13.2, 13.5–13.9; design A9, "Quote
 * pairing" and "Attachment"; D18, D19), with the outermost pair winning
 * when one pair lies inside another (Req 13.10).
 *
 * Sentence membership is decided by `countBoundaries`, the Segmenter's own
 * predicate (A8), so attachment agrees with `segment` by construction.
 * Every function is total and never throws.
 */

import { countBoundaries } from "../boundary.js";
import type { CitationValue, ExtractedQuote } from "../types.js";
import { matchPrecedingGap } from "./case-name.js";

/** A Quotation_Pair: Offsets of its opening and closing marks; content is `[open + 1, close)`. */
export type QuotePair = Readonly<{ open: number; close: number }>;

/** The part of a Citation the quote layer reads: its range and its kind. */
export type QuoteCitation = Readonly<{
  start: number;
  end: number;
  value: Readonly<{ kind: CitationValue["kind"] }>;
}>;

const STRAIGHT = '"';
const CURLY_OPEN = "“";
const CURLY_CLOSE = "”";
const NON_WHITESPACE = /\S/;
const WHITESPACE = /^\s$/;
const FOLLOW_PUNCT: ReadonlySet<string> = new Set([",", ";", ":", "("]);

/** Content holds at least one non-whitespace code unit (Req 13.2, 13.6). */
function hasContent(text: string, pair: QuotePair): boolean {
  return NON_WHITESPACE.test(text.slice(pair.open + 1, pair.close));
}

/** Straight marks paired (1st, 2nd), (3rd, 4th), …; a trailing odd mark is stray. */
function pairStraight(text: string): QuotePair[] {
  const out: QuotePair[] = [];
  let open = -1;
  for (let i = text.indexOf(STRAIGHT); i >= 0; i = text.indexOf(STRAIGHT, i + 1)) {
    if (open < 0) {
      open = i;
    } else {
      out.push({ open, close: i });
      open = -1;
    }
  }
  return out;
}

/** Each `“` pairs with the next `”` that comes before the next `“`. */
function pairCurly(text: string): QuotePair[] {
  const out: QuotePair[] = [];
  let open = -1;
  for (let i = 0; i < text.length; i++) {
    const u = text.charAt(i);
    if (u === CURLY_OPEN) {
      open = i;
    } else if (u === CURLY_CLOSE && open >= 0) {
      out.push({ open, close: i });
      open = -1;
    }
  }
  return out;
}

/**
 * Drops every pair B that lies inside some pair A (`A.open < B.open` and
 * `B.close < A.close`). `sorted` is ascending by `open`; mark Offsets are
 * distinct, so B lies inside an earlier pair exactly when its `close` is
 * below the greatest `close` seen so far (Req 13.10).
 */
function dropContained(sorted: readonly QuotePair[]): QuotePair[] {
  const out: QuotePair[] = [];
  let maxClose = -1;
  for (const p of sorted) {
    if (p.close > maxClose) out.push(p);
    maxClose = Math.max(maxClose, p.close);
  }
  return out;
}

/**
 * Every Quotation_Pair with non-whitespace content that lies inside no other
 * pair, ascending by opening mark. Straight and curly marks are paired
 * independently, so a `“…"` mixture yields nothing (Req 13.1, 13.6, 13.10).
 * A straight and a curly pair that cross are both kept.
 */
export function pairQuoteMarks(text: string): readonly QuotePair[] {
  const pairs = [...pairStraight(text), ...pairCurly(text)];
  const sorted = pairs.filter((p) => hasContent(text, p)).sort((a, b) => a.open - b.open);
  return dropContained(sorted);
}

const isAttachable = (c: QuoteCitation): boolean => c.value.kind !== "other";

/** Index of the first citation with `start > at`, or `cits.length`. */
function firstStartingAfter(cits: readonly QuoteCitation[], at: number): number {
  let lo = 0;
  let hi = cits.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const c = cits[mid];
    if (c !== undefined && c.start <= at) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Index of the citation with the greatest `end ≤ at`, or -1. Ends ascend with starts. */
function lastEndingBy(cits: readonly QuoteCitation[], at: number): number {
  let lo = 0;
  let hi = cits.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const c = cits[mid];
    if (c !== undefined && c.end <= at) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

/** Req 13.1: the first citation after the closing mark, if the rule holds. */
function precedingTarget(
  text: string,
  pair: QuotePair,
  cits: readonly QuoteCitation[],
): QuoteCitation | null {
  const x = cits[firstStartingAfter(cits, pair.close)];
  if (x === undefined || !isAttachable(x)) return null;
  if (!matchPrecedingGap(text, pair.close + 1, x.start)) return null;
  return countBoundaries(text, pair.close, x.start, cits, 2) <= 1 ? x : null;
}

/** `[from, to)` holds only whitespace and `, ; : (` (Req 13.8). */
function isFollowGap(text: string, from: number, to: number): boolean {
  for (let i = from; i < to; i++) {
    const u = text.charAt(i);
    if (!FOLLOW_PUNCT.has(u) && !WHITESPACE.test(u)) return false;
  }
  return true;
}

/** Req 13.8: the citation ending before the opening mark, if the rule holds. */
function followingTarget(
  text: string,
  pair: QuotePair,
  cits: readonly QuoteCitation[],
): QuoteCitation | null {
  const y = cits[lastEndingBy(cits, pair.open)];
  if (y === undefined || !isAttachable(y)) return null;
  if (!isFollowGap(text, y.end, pair.open)) return null;
  return countBoundaries(text, y.start, pair.open, cits, 1) === 0 ? y : null;
}

function quoteOf(
  text: string,
  pair: QuotePair,
  citationStart: number,
  rule: ExtractedQuote["rule"],
): ExtractedQuote {
  const start = pair.open + 1;
  return { start, end: pair.close, text: text.slice(start, pair.close), citationStart, rule };
}

/**
 * One Quote_Candidate per pair that attaches, in pair order. The preceding
 * rule takes precedence over the following rule (Req 13.5); a pair that
 * meets neither yields nothing (Req 13.9). `cits` must be sorted by `start`
 * and pairwise non-overlapping, as the Extractor returns them.
 */
export function attachQuotes(
  text: string,
  pairs: readonly QuotePair[],
  cits: readonly QuoteCitation[],
): readonly ExtractedQuote[] {
  const out: ExtractedQuote[] = [];
  for (const pair of pairs) {
    const x = precedingTarget(text, pair, cits);
    if (x !== null) {
      out.push(quoteOf(text, pair, x.start, "preceding"));
      continue;
    }
    const y = followingTarget(text, pair, cits);
    if (y !== null) out.push(quoteOf(text, pair, y.start, "following"));
  }
  return out;
}
