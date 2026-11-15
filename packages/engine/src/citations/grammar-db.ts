/**
 * Database_Citation grammar (design A9 step 2, Req 9.4).
 *
 *   <yyyy> WL <n>
 *   <yyyy> <court tokens> LEXIS <n>
 *
 * each optionally followed by `, at *<pincite>` (one item of a
 * Pincite_Expression, `page` or `page-short`, no list: Req 18; the value keeps
 * the first page and the match end moves), then optionally by a
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
 * The LEXIS court (A9 step 2, D22) starts exactly one space after the year
 * and runs, over court tokens joined by single spaces, to the first token
 * that is exactly `LEXIS`. It fails if no token precedes `LEXIS`, if it
 * passes 40 code units first, or if any court token is a year in 1600–2999;
 * the last rule is what stops an earlier number (`§ 1983`, `Local 2092`) from
 * starting a LEXIS match that swallows the prose before the real year. A
 * court that `lookupLexisCourt` resolves records the list entry with
 * `lexisCourtListed: true`; otherwise an Unlisted_Lexis_Court
 * (`isUnlistedLexisCourt`) records the court as written with
 * `lexisCourtListed: false`; any other court is no citation.
 *
 * Reads stay within `[p − 2, p + 150)` (the pincite adds at most 11 code
 * units for `371-72345`), well inside `LOOKAHEAD`.
 */

import type { DatabaseValue } from "../types.js";
import {
  DOC_NUMBER_RANGE,
  YEAR_RANGE,
  type IntRange,
  isWordCharAt,
  isWordCharBefore,
  readInt,
  readLiteral,
  readSpaces,
} from "./lex.js";
import { isCourtText, MAX_COURT_LENGTH } from "./grammar.js";
import { isUnlistedLexisCourt, lookupLexisCourt } from "./lexis-courts.js";
import { readPinciteExpression } from "./pincite.js";

/** A Database_Citation match: `[start, end)` and its value. */
export type DatabaseMatch = Readonly<{ start: number; end: number; value: DatabaseValue }>;

const WL = "WL";
const LEXIS = "LEXIS";
const PINCITE_LEAD = ", at *";
/** Code units that end a court token (A9 step 2.1). */
const COURT_TOKEN_END = /[\s()"“”]/u;

type Field = Readonly<{ end: number }>;
type NumberField = Readonly<{ value: number; end: number }>;
type Designator = Readonly<
  { designator: "WL" } | { designator: "LEXIS"; lexisCourtListed: boolean; lexisCourt: string }
>;
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
  const designator = lexisDesignator(court.value);
  const end = readSpaces(text, court.end);
  return end === null || designator === null ? null : { value: designator, end };
}

/**
 * Classifies a LEXIS court as written (A9 step 2.2–2.4, D22): no token may be
 * a year; then the list entry if listed, else the court as written if it is
 * an Unlisted_Lexis_Court, else `null`.
 */
function lexisDesignator(court: string): Designator | null {
  if (court.split(" ").some(isYearToken)) return null;
  const entry = lookupLexisCourt(court);
  if (entry !== null) return { designator: "LEXIS", lexisCourtListed: true, lexisCourt: entry };
  return isUnlistedLexisCourt(court)
    ? { designator: "LEXIS", lexisCourtListed: false, lexisCourt: court }
    : null;
}

/**
 * Reads court tokens up to the first `LEXIS` token, and returns the court and
 * the Offset just past `LEXIS` (A9 step 2.1). Fails if no court token
 * precedes `LEXIS`, a separator is not one U+0020, or `LEXIS` is not found
 * within the 40-code-unit court bound. Reads stop at `at + 46`.
 */
function readLexisCourt(text: string, at: number): Located<string> | null {
  let tokenStart = at;
  for (;;) {
    const tokenEnd = readCourtToken(text, tokenStart, at + MAX_COURT_LENGTH + 1 + LEXIS.length);
    if (tokenEnd === null) return null;
    if (text.slice(tokenStart, tokenEnd) === LEXIS) {
      if (tokenStart === at) return null;
      return { value: text.slice(at, tokenStart - 1), end: tokenEnd };
    }
    if (tokenEnd - at > MAX_COURT_LENGTH) return null;
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
  while (end < text.length && !COURT_TOKEN_END.test(text.charAt(end))) {
    if (end === limit) return null;
    end += 1;
  }
  return end === at ? null : end;
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
  if (lead === null) return null;
  const read = readPinciteExpression(text, lead, { list: false, startsMember: () => false });
  return read === null ? null : { value: read.first, end: read.end };
}

/**
 * Reads ` (<court> <year>|<year>|<court>)` at `at` under the court rule and
 * returns the Offset past `)`, or `null`. Reads at most 49 code units.
 */
function readParenthetical(text: string, at: number): Field | null {
  const open = readSpaces(text, at);
  if (open === null || text[open] !== "(") return null;
  const limit = open + 1 + MAX_COURT_LENGTH + 1 + 4;
  const found = text.slice(open + 1, limit + 1).indexOf(")");
  if (found === -1) return null;
  const close = open + 1 + found;
  return isParentheticalContent(text.slice(open + 1, close)) ? { end: close + 1 } : null;
}

/** `<court> <year>`, `<year>`, or `<court>`, with the court under the court rule. */
function isParentheticalContent(content: string): boolean {
  const lastSpace = content.lastIndexOf(" ");
  const last = content.slice(lastSpace + 1);
  if (!isYearToken(last)) return isCourtText(content);
  return lastSpace === -1 || isCourtText(content.slice(0, lastSpace));
}
