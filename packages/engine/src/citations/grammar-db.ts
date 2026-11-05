/**
 * Database_Citation grammar (design A9 step 2, Req 9.4).
 *
 *   <yyyy> WL <n>
 *   <yyyy> <court tokens> LEXIS <n>
 *
 * each optionally followed by `, at *<pincite>`, then optionally by a
 * ` (<court> <year>|<year>|<court>)` parenthetical. The parenthetical is kept
 * in the match range (Req 9.2) but not in the value; format() never prints it,
 * so a citation written with one gets a Normalised_Form (Req 11.2).
 *
 * Separators are exactly one U+0020 space. Numbers follow Req 10.1 (no
 * leading zeros, range-checked). The last digit of the document number or
 * pincite must not be followed by a letter or number (Req 9.8). A pincite or
 * parenthetical that does not parse is not part of the citation; the citation
 * then ends earlier, as for reporter citations (A9 court rule).
 *
 * The LEXIS court follows the tightened court rule (A9, D3): 1 to 40 code
 * units of tokens without whitespace, parentheses, or `"“”`, joined by single
 * spaces, whose last token is not a year in 1600–2999. A court token is never
 * `LEXIS`: the first `LEXIS` token ends the court.
 *
 * Reads stay within `[p − 2, p + 140)`, well inside `LOOKAHEAD`.
 */

import type { DatabaseValue } from "../types.js";
import {
  DOC_NUMBER_RANGE,
  PINCITE_RANGE,
  YEAR_RANGE,
  type IntRange,
  isWordCharAt,
  isWordCharBefore,
  readInt,
  readLiteral,
  readSpaces,
} from "./lex.js";

/** A Database_Citation match: `[start, end)` and its value. */
export type DatabaseMatch = Readonly<{ start: number; end: number; value: DatabaseValue }>;

/** Longest court (Req 10.1, A9 court rule). */
export const MAX_COURT = 40;

const WL = "WL";
const LEXIS = "LEXIS";
const PINCITE_LEAD = ", at *";
const COURT_FORBIDDEN = /[\s()"“”]/u;

type Field = Readonly<{ end: number }>;
type NumberField = Readonly<{ value: number; end: number }>;
type Designator = Readonly<{ designator: "WL" } | { designator: "LEXIS"; lexisCourt: string }>;
type Located<T> = Readonly<{ value: T; end: number }>;

/**
 * Matches a Database_Citation starting at `p`, or returns `null`. Never
 * throws; any `p` outside the Text yields `null`.
 */
export function matchDatabaseAt(text: string, p: number): DatabaseMatch | null {
  if (p < 0 || p >= text.length || isWordCharBefore(text, p)) return null;
  const year = readInt(text, p, YEAR_RANGE);
  if (year === null) return null;
  const afterYear = readSpaces(text, year.end);
  if (afterYear === null) return null;
  const head = readDesignator(text, afterYear);
  if (head === null) return null;
  const docNumber = readBoundedInt(text, head.end, DOC_NUMBER_RANGE);
  if (docNumber === null) return null;
  const pincite = readPincite(text, docNumber.end);
  const afterPincite = pincite === null ? docNumber.end : pincite.end;
  const paren = readParenthetical(text, afterPincite);
  const value: DatabaseValue = {
    kind: "database",
    year: year.value,
    ...head.value,
    number: docNumber.value,
    ...(pincite === null ? {} : { pincite: pincite.value }),
  };
  return { start: p, end: paren === null ? afterPincite : paren.end, value };
}

/**
 * Reads `WL ` or `<court> LEXIS ` at `at` and returns the designator with the
 * Offset of the document number. `WL` is tried first.
 */
function readDesignator(text: string, at: number): Located<Designator> | null {
  const wl = readLiteral(text, at, WL);
  if (wl !== null) {
    const end = readSpaces(text, wl);
    if (end !== null) return { value: { designator: "WL" }, end };
  }
  const court = readLexisCourt(text, at);
  if (court === null) return null;
  const end = readSpaces(text, court.end);
  return end === null ? null : { value: { designator: "LEXIS", lexisCourt: court.value }, end };
}

/**
 * Reads court tokens up to the first `LEXIS` token, and returns the court and
 * the Offset just past `LEXIS`. Fails if no court token precedes `LEXIS`, the
 * court breaks the court rule, or `LEXIS` is not found within the bound.
 */
function readLexisCourt(text: string, at: number): Located<string> | null {
  let tokenStart = at;
  for (;;) {
    const tokenEnd = readCourtToken(text, tokenStart, at + MAX_COURT + 1 + LEXIS.length);
    if (tokenEnd === null) return null;
    if (text.slice(tokenStart, tokenEnd) === LEXIS) {
      if (tokenStart === at) return null;
      const court = text.slice(at, tokenStart - 1);
      return isCourt(court) ? { value: court, end: tokenEnd } : null;
    }
    if (tokenEnd - at > MAX_COURT) return null;
    const next = readSpaces(text, tokenEnd);
    if (next === null) return null;
    tokenStart = next;
  }
}

/**
 * Reads one court token (a maximal run of code units that are not whitespace,
 * parentheses, or `"“”`) at `at`, ending by `limit`. Returns its end or
 * `null` if it is empty or would pass `limit`.
 */
function readCourtToken(text: string, at: number, limit: number): number | null {
  let end = at;
  while (end < text.length && !COURT_FORBIDDEN.test(text.charAt(end))) {
    if (end === limit) return null;
    end += 1;
  }
  return end === at ? null : end;
}

/**
 * The tightened court rule (A9, D3) on a candidate court string: 1 to 40 code
 * units, tokens without whitespace, parentheses, or `"“”` joined by single
 * spaces, last token not a year in 1600–2999.
 */
export function isCourt(court: string): boolean {
  if (court.length < 1 || court.length > MAX_COURT) return false;
  const tokens = court.split(" ");
  if (tokens.some((t) => t.length === 0 || COURT_FORBIDDEN.test(t))) return false;
  return !isYearToken(tokens[tokens.length - 1] ?? "");
}

/** True when `token` is exactly a four-digit year in YEAR_RANGE. */
function isYearToken(token: string): boolean {
  const year = readInt(token, 0, YEAR_RANGE);
  return year !== null && year.end === token.length;
}

/** readInt plus the Req 9.8 right-side check on the last digit. */
function readBoundedInt(text: string, at: number, range: IntRange): NumberField | null {
  const n = readInt(text, at, range);
  return n === null || isWordCharAt(text, n.end) ? null : n;
}

/** Reads `, at *<pincite>` at `at`, or returns `null` if it does not parse. */
function readPincite(text: string, at: number): NumberField | null {
  const lead = readLiteral(text, at, PINCITE_LEAD);
  return lead === null ? null : readBoundedInt(text, lead, PINCITE_RANGE);
}

/**
 * Reads ` (<court> <year>|<year>|<court>)` at `at` under the court rule and
 * returns the Offset past `)`, or `null`. Reads at most 49 code units.
 */
function readParenthetical(text: string, at: number): Field | null {
  const open = readSpaces(text, at);
  if (open === null || text[open] !== "(") return null;
  const limit = open + 1 + MAX_COURT + 1 + 4;
  const found = text.slice(open + 1, limit + 1).indexOf(")");
  if (found === -1) return null;
  const close = open + 1 + found;
  return isParentheticalContent(text.slice(open + 1, close)) ? { end: close + 1 } : null;
}

/** `<court> <year>`, `<year>`, or `<court>`, with the court under the court rule. */
function isParentheticalContent(content: string): boolean {
  const lastSpace = content.lastIndexOf(" ");
  const last = content.slice(lastSpace + 1);
  if (!isYearToken(last)) return isCourt(content);
  return lastSpace === -1 || isCourt(content.slice(0, lastSpace));
}
