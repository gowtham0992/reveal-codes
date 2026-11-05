/**
 * Bounded lexical readers shared by the citation grammars (design A9).
 *
 * Every reader takes the Text and a start Offset and reads forward a bounded
 * number of code units, so a grammar built from them keeps `matchAt(p)`
 * inside `[p − LOOKBEHIND, p + LOOKAHEAD)`. Readers return the end Offset of
 * what they read, or `null` when the input does not match; they never throw.
 *
 * Numbers follow Req 10.1: ASCII digits, no leading zeros, range-checked.
 * Word characters follow Req 9.8: Unicode letters (`\p{L}`) and numbers
 * (`\p{N}`), read as whole code points so a Surrogate_Pair counts once.
 */

/** An inclusive integer range `[min, max]` with `1 ≤ min ≤ max`. */
export type IntRange = Readonly<{ min: number; max: number }>;

/** Volume and page (Req 10.1). */
export const VOLUME_RANGE: IntRange = { min: 1, max: 99_999 };
export const PAGE_RANGE: IntRange = { min: 1, max: 99_999 };
/** Pincite (Req 10.1). */
export const PINCITE_RANGE: IntRange = { min: 1, max: 99_999 };
/** Four-digit year (Req 10.1). */
export const YEAR_RANGE: IntRange = { min: 1600, max: 2999 };
/** Database_Citation document number (Req 10.1). */
export const DOC_NUMBER_RANGE: IntRange = { min: 1, max: 9_999_999 };

/** A number read from the Text and the Offset just past its last digit. */
export type IntRead = Readonly<{ value: number; end: number }>;

const WORD_CHAR = /^[\p{L}\p{N}]$/u;
const CODE_0 = 48;
const CODE_9 = 57;
const SPACE = " ";

/** True when the code unit at `i` is an ASCII digit `0`–`9`. */
export function isAsciiDigitAt(text: string, i: number): boolean {
  const u = text.charCodeAt(i);
  return u >= CODE_0 && u <= CODE_9;
}

/** True when `unit` is one code point that is a Unicode letter or number. */
export function isWordChar(unit: string): boolean {
  return WORD_CHAR.test(unit);
}

const isHigh = (u: number): boolean => u >= 0xd800 && u <= 0xdbff;
const isLow = (u: number): boolean => u >= 0xdc00 && u <= 0xdfff;

/** The code point starting at `i` (a lone surrogate on its own), or "". */
function codePointAt(text: string, i: number): string {
  if (i < 0 || i >= text.length) return "";
  const end = isHigh(text.charCodeAt(i)) && isLow(text.charCodeAt(i + 1)) ? i + 2 : i + 1;
  return text.slice(i, end);
}

/** The code point ending just before `p` (a lone surrogate on its own), or "". */
function codePointBefore(text: string, p: number): string {
  if (p <= 0 || p > text.length) return "";
  const start = isLow(text.charCodeAt(p - 1)) && isHigh(text.charCodeAt(p - 2)) ? p - 2 : p - 1;
  return text.slice(start, p);
}

/**
 * True when the code point that ends at `p` is a letter or number (Req 9.8,
 * left side). Reads at most `text[p − 2 .. p)`.
 */
export function isWordCharBefore(text: string, p: number): boolean {
  return isWordChar(codePointBefore(text, p));
}

/**
 * True when the code point that starts at `p` is a letter or number (Req 9.8,
 * right side). Reads at most `text[p .. p + 2)`.
 */
export function isWordCharAt(text: string, p: number): boolean {
  return isWordChar(codePointAt(text, p));
}

/** Number of decimal digits in a positive integer. */
function digitCount(n: number): number {
  return String(n).length;
}

/**
 * Reads an integer of ASCII digits starting at `at` (Req 10.1).
 *
 * The digit run must be maximal: if more digits follow than `range.max` has,
 * the read fails rather than taking a prefix. It also fails on no digit, a
 * leading zero, or a value outside `range`. Reads at most
 * `digitCount(range.max) + 1` code units.
 */
export function readInt(text: string, at: number, range: IntRange): IntRead | null {
  if (at < 0 || !isAsciiDigitAt(text, at)) return null;
  if (text.charCodeAt(at) === CODE_0) return null;
  const maxDigits = digitCount(range.max);
  let end = at;
  let value = 0;
  while (end < text.length && isAsciiDigitAt(text, end)) {
    if (end - at === maxDigits) return null;
    value = value * 10 + (text.charCodeAt(end) - CODE_0);
    end += 1;
  }
  if (value < range.min || value > range.max) return null;
  return { value, end };
}

/**
 * Reads a run of U+0020 spaces starting at `at`, of length `min` to `max`.
 * Returns the Offset after the run, or `null` if the run is shorter than
 * `min` or longer than `max`. Reads at most `max + 1` code units.
 */
export function readSpaces(text: string, at: number, min = 1, max = 1): number | null {
  if (at < 0) return null;
  let end = at;
  while (end < text.length && text[end] === SPACE) {
    if (end - at === max) return null;
    end += 1;
  }
  return end - at < min ? null : end;
}

/**
 * Reads `literal` exactly at `at`, code unit for code unit. Returns the
 * Offset after it, or `null`. Reads at most `literal.length` code units.
 */
export function readLiteral(text: string, at: number, literal: string): number | null {
  if (at < 0 || literal.length === 0) return null;
  return text.startsWith(literal, at) ? at + literal.length : null;
}

/**
 * Reads the maximal run of word characters (letters and numbers, by code
 * point) starting at `at`, up to `limit` code units. Returns the Offset after
 * the run, or `null` if the run is empty or would exceed `limit`.
 */
export function readWord(text: string, at: number, limit: number): number | null {
  if (at < 0) return null;
  let end = at;
  for (;;) {
    const cp = codePointAt(text, end);
    if (!isWordChar(cp)) break;
    if (end + cp.length - at > limit) return null;
    end += cp.length;
  }
  return end === at ? null : end;
}
