/**
 * The one Sentence-boundary predicate (design A8 step 3, Req 8.3, 8.5, 8.6,
 * 8.8). `segment.ts` and `citations/quotes.ts` both call it, so Sentence
 * membership for quote attachment matches the Segmenter by construction.
 *
 * Citation ranges are passed in; this module does not import the Extractor.
 * They must be sorted by `start` and pairwise non-overlapping, which the
 * Extractor guarantees (Req 9.1, 9.7).
 */

import { isAbbreviationEndingAt, type AbbreviationIndex } from "./abbreviations";
import { LEGAL_ABBREVIATION_INDEX } from "./citations/reporters.js";

/** A half-open `[start, end)` Offset range, such as an extracted Citation's. */
export type CitationRange = Readonly<{ start: number; end: number }>;

const WHITESPACE = /\s/;
const isWhitespace = (unit: string): boolean => unit.length > 0 && WHITESPACE.test(unit);
const isCloser = (unit: string): boolean =>
  unit === '"' || unit === "”" || unit === "'" || unit === "’" || unit === ")";
const isTerminator = (unit: string): boolean => unit === "." || unit === "?" || unit === "!";

/** True when `start < b < end` for some range (binary search over sorted ranges). */
export function isInsideCitation(b: number, ranges: readonly CitationRange[]): boolean {
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const r = ranges[mid];
    if (r === undefined) return false;
    if (b <= r.start) hi = mid - 1;
    else if (b >= r.end) lo = mid + 1;
    else return true;
  }
  return false;
}

/**
 * Walks back from `b - 1` over `\s+`, then `["”'’)]*`, and returns the index
 * of the last code unit of the terminator run, or -1 if no `[.?!]` is there.
 */
function terminatorEndBefore(text: string, b: number): number {
  let i = b - 1;
  if (!isWhitespace(text.charAt(i))) return -1;
  while (i >= 0 && isWhitespace(text.charAt(i))) i -= 1;
  while (i >= 0 && isCloser(text.charAt(i))) i -= 1;
  return i >= 0 && isTerminator(text.charAt(i)) ? i : -1;
}

/**
 * True when Offset `b` is a Sentence boundary: `text[b]` is non-whitespace,
 * it follows whitespace preceded by a terminator sequence (Req 8.3), `b` is
 * not strictly inside a citation range (Req 8.5), and the terminator run does
 * not end with a Legal_Abbreviation's final period (Req 8.6). `b` follows a
 * whitespace code unit, so it is never inside a Surrogate_Pair (Req 8.8).
 */
export function isBoundaryAt(
  text: string,
  b: number,
  citationRanges: readonly CitationRange[],
  index: AbbreviationIndex = LEGAL_ABBREVIATION_INDEX,
): boolean {
  if (!Number.isInteger(b) || b <= 0 || b >= text.length) return false;
  if (isWhitespace(text.charAt(b))) return false;
  const i = terminatorEndBefore(text, b);
  if (i < 0) return false;
  if (isInsideCitation(b, citationRanges)) return false;
  return !isAbbreviationEndingAt(text, i, index);
}

/**
 * Counts the boundaries `b` in `(from, to]`, evaluating `isBoundaryAt` only
 * where `text[b - 1]` is whitespace, and stops once the count reaches `cap`.
 */
export function countBoundaries(
  text: string,
  from: number,
  to: number,
  citationRanges: readonly CitationRange[],
  cap: number,
  index: AbbreviationIndex = LEGAL_ABBREVIATION_INDEX,
): number {
  let count = 0;
  if (!(cap > 0)) return count;
  const first = Math.max(Math.floor(from) + 1, 1);
  const last = Math.min(Math.floor(to), text.length - 1);
  for (let b = first; b <= last; b += 1) {
    if (!isWhitespace(text.charAt(b - 1))) continue;
    if (!isBoundaryAt(text, b, citationRanges, index)) continue;
    count += 1;
    if (count >= cap) return count;
  }
  return count;
}
