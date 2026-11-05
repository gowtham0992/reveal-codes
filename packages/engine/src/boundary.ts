/**
 * The one Sentence-boundary predicate (design A8 step 3, Req 8.3, 8.5, 8.6,
 * 8.8, 8.10). `segment.ts` and `citations/quotes.ts` both call it, so Sentence
 * membership for quote attachment matches the Segmenter by construction.
 *
 * Citation ranges are passed in; this module does not import the Extractor.
 * They must be sorted by `start` and pairwise non-overlapping, which the
 * Extractor guarantees (Req 9.1, 9.7).
 *
 * Reads for one `isBoundaryAt(text, b, …)` call: backward over the
 * whitespace-and-closer run before `b` (unbounded), at most the longest
 * Legal_Abbreviation before the terminator's last code unit `i`, then
 * `text[i − 2 .. i + 2)`, and, only when that initial shape holds (Req 8.10),
 * forward over the one `W` run starting at `b`. A `W` run holds no
 * whitespace, so the runs read at distinct candidate Offsets are disjoint.
 */

import { isAbbreviationEndingAt, type AbbreviationIndex } from "./abbreviations";
import { isPartyWordUnitAt } from "./citations/party-lex.js";
import { isCapitalisedWord } from "./citations/party.js";
import { LEGAL_ABBREVIATION_INDEX } from "./citations/reporters.js";

/** A half-open `[start, end)` Offset range, such as an extracted Citation's. */
export type CitationRange = Readonly<{ start: number; end: number }>;

const WHITESPACE = /\s/;
const isWhitespace = (unit: string): boolean => unit.length > 0 && WHITESPACE.test(unit);
const isCloser = (unit: string): boolean =>
  unit === '"' || unit === "”" || unit === "'" || unit === "’" || unit === ")";
const isTerminator = (unit: string): boolean => unit === "." || unit === "?" || unit === "!";
const isAsciiUpper = (unit: string): boolean => unit.length === 1 && unit >= "A" && unit <= "Z";
const isHighSurrogate = (u: number): boolean => u >= 0xd800 && u <= 0xdbff;

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
 * End of the maximal `W` run (letters, ASCII digits, `.`, `'`, `’`, `-`;
 * design A9 "Tokens") starting at `start`. A Surrogate_Pair letter counts as
 * one unit of the run.
 */
function wordRunEnd(text: string, start: number): number {
  let e = start;
  while (e < text.length && isPartyWordUnitAt(text, e)) {
    e += isHighSurrogate(text.charCodeAt(e)) ? 2 : 1;
  }
  return e;
}

/**
 * Req 8.10: `text[i]` is a `.` right after one ASCII capital, which follows
 * the start of the Text or an ASCII space, and the `.` is followed by one
 * ASCII space and a Capitalised_Word (the maximal `W` run starting at
 * `i + 2`, tested with the Glossary's `isCapitalisedWord`).
 */
export function isInitialBeforeCapitalisedWord(text: string, i: number): boolean {
  if (!Number.isInteger(i) || i < 1 || text.charAt(i) !== ".") return false;
  if (!isAsciiUpper(text.charAt(i - 1))) return false;
  if (i >= 2 && text.charAt(i - 2) !== " ") return false;
  if (text.charAt(i + 1) !== " ") return false;
  return isCapitalisedWord(text, i + 2, wordRunEnd(text, i + 2));
}

/**
 * True when Offset `b` is a Sentence boundary: `text[b]` is non-whitespace,
 * it follows whitespace preceded by a terminator sequence (Req 8.3), `b` is
 * not strictly inside a citation range (Req 8.5), the terminator run does
 * not end with a Legal_Abbreviation's final period (Req 8.6), and it is not
 * a Single_Capital_Initial's `.` before one space and a Capitalised_Word
 * (Req 8.10). `index` applies to the 8.6 test only. `b` follows a whitespace
 * code unit, so it is never inside a Surrogate_Pair (Req 8.8).
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
  if (isAbbreviationEndingAt(text, i, index)) return false;
  return !isInitialBeforeCapitalisedWord(text, i);
}

/**
 * Counts the boundaries `b` in `(from, to]`, evaluating `isBoundaryAt` only
 * where `text[b - 1]` is whitespace, and stops once the count reaches `cap`.
 * For Req 8.10 it may read the `W` run starting at a `b ≤ to` past `to`.
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
