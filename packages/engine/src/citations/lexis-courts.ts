/**
 * The Lexis_Court_List and the LEXIS court rules (design A9 step 2, A13, D22;
 * Req 9.4, 10.1, 14.8).
 *
 * `lexis-courts.json` is a static module import, so nothing is read from disk
 * or network at run time, and this module is its only importer (Req 14.8).
 * Both indexes are built once at module load and map a key to the position of
 * the first entry with that key, so `lexis-courts.json` order decides every
 * collision, as for the Reporter_List.
 *
 * - `lookupLexisCourt`: the list entry for a court as written, exact first,
 *   then collapsed (periods and U+0020 spaces removed, case kept).
 * - `isUnlistedLexisCourt`: the Glossary Unlisted_Lexis_Court rule, including
 *   "matches no entry, exactly or collapsed".
 *
 * Nothing here throws.
 */

import { readInt, YEAR_RANGE } from "./lex.js";
import lexisCourts from "./lexis-courts.json" with { type: "json" };
import { collapseReporter, firstIndexBy } from "./reporters.js";

/** The Lexis_Court_List, in `lexis-courts.json` (reporters-db) order. */
export const LEXIS_COURTS: readonly string[] = lexisCourts;

/** Entry text to its position in `LEXIS_COURTS`. */
export const lexisExactIndex: ReadonlyMap<string, number> = firstIndexBy(LEXIS_COURTS, (e) => e);

/** Collapsed entry text to the position of the first entry with that key. */
export const lexisCollapsedIndex: ReadonlyMap<string, number> = firstIndexBy(
  LEXIS_COURTS,
  collapseReporter,
);

/** Longest LEXIS court in code units (Req 10.1, Glossary Unlisted_Lexis_Court). */
const MAX_LEXIS_COURT = 40;

/** Code units no Unlisted_Lexis_Court token may contain. */
const UNLISTED_FORBIDDEN = /[\s()"“”,]/u;

/** First code unit of every Unlisted_Lexis_Court token: ASCII uppercase or digit. */
const UNLISTED_TOKEN_START = /^[A-Z0-9]/;

/**
 * The Lexis_Court_List entry for `court`, spelled exactly as in the list: an
 * exact match, else the first entry with the same collapsed key. Returns
 * `null` for a court that matches neither (Req 9.4).
 */
export function lookupLexisCourt(court: string): string | null {
  const at = lexisExactIndex.get(court) ?? lexisCollapsedIndex.get(collapseReporter(court));
  return at === undefined ? null : (LEXIS_COURTS[at] ?? null);
}

/** True when `token` is exactly a four-digit year in 1600–2999. */
function isYearToken(token: string): boolean {
  const year = readInt(token, 0, YEAR_RANGE);
  return year !== null && year.end === token.length;
}

/** One token of an Unlisted_Lexis_Court (Glossary). */
function isUnlistedToken(token: string): boolean {
  return (
    UNLISTED_TOKEN_START.test(token) &&
    !UNLISTED_FORBIDDEN.test(token) &&
    !isYearToken(token) &&
    token !== "LEXIS"
  );
}

/**
 * True when `court` is an Unlisted_Lexis_Court (Glossary): 1 to 40 code
 * units; tokens separated by single U+0020 spaces, each starting with an
 * ASCII uppercase letter or digit, none a year in 1600–2999, none holding
 * `,`, whitespace, a parenthesis, or `"“”`, none `LEXIS`; first token not
 * `WL`; and no Lexis_Court_List entry matches it exactly or collapsed.
 */
export function isUnlistedLexisCourt(court: string): boolean {
  if (court.length < 1 || court.length > MAX_LEXIS_COURT) return false;
  const tokens = court.split(" ");
  if (tokens[0] === "WL" || !tokens.every(isUnlistedToken)) return false;
  return lookupLexisCourt(court) === null;
}
