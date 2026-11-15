/**
 * Pincite_Expression reader (design "The pincite expression"; Req 18).
 *
 *   expression = item { ", " item }     at most 5 items, 24 code units in all
 *   item       = page [ dash short ]
 *   page       = ASCII digits, PINCITE_RANGE (readInt)
 *   dash       = "-" | "–"              U+002D or U+2013, no spaces
 *   short      = 1 to 5 ASCII digits    a leading zero is allowed (371-05)
 *
 * An item is accepted only when its last digit is not followed by a letter or
 * number (Req 9.8). When `dash short` is absent, too long, or fails that
 * check, the item is the page alone and the expression ends there. A later
 * item is refused when `startsMember` is true at its start, or when it is a
 * four-digit number from 1600 to 2999 followed by a space and an uppercase
 * letter (the start of `2010 WL 1` or `2010 U.S. Dist. LEXIS 9`).
 *
 * `first` is the first item's page; the second number of a range and later
 * items are not stored. Reads at most 24 code units past `at`, plus the
 * look-ahead of `startsMember` for an item start, plus 2 for the boundary
 * checks. This module imports only `lex.ts`; it never throws.
 */

import {
  PINCITE_RANGE,
  YEAR_RANGE,
  isAsciiDigitAt,
  isWordCharAt,
  readInt,
  readLiteral,
  readSpaces,
} from "./lex.js";

export type PinciteRead = Readonly<{ first: number; end: number }>;

export type PinciteOptions = Readonly<{
  /** Read `, <item>` repeats. False for a Database_Citation. */
  list: boolean;
  /** True when `at` starts a Parallel_Citation member; supplied by the caller. */
  startsMember: (text: string, at: number) => boolean;
}>;

/** Most items in one expression. */
export const MAX_PINCITE_ITEMS = 5;
/** Most code units in one expression. */
export const MAX_PINCITE_LENGTH = 24;
const MAX_SHORT_DIGITS = 5;
const UPPERCASE = /^\p{Lu}$/u;

/** Reads the shortened second number after a dash; null when it does not qualify. */
function readShort(text: string, at: number): number | null {
  let end = at;
  while (end < text.length && isAsciiDigitAt(text, end)) {
    if (end - at === MAX_SHORT_DIGITS) return null;
    end += 1;
  }
  return end === at || isWordCharAt(text, end) ? null : end;
}

/** Reads `page [dash short]` at `at`, or null when the page is refused. */
function readItem(text: string, at: number): PinciteRead | null {
  const page = readInt(text, at, PINCITE_RANGE);
  if (page === null) return null;
  const dash = text[page.end] === "-" || text[page.end] === "–";
  const shortEnd = dash ? readShort(text, page.end + 1) : null;
  if (shortEnd !== null) return { first: page.value, end: shortEnd };
  return isWordCharAt(text, page.end) ? null : { first: page.value, end: page.end };
}

/** True when `at` starts `<1600-2999> <Uppercase>`, the start of a WL or LEXIS citation. */
function startsDatabaseYear(text: string, at: number): boolean {
  const year = readInt(text, at, YEAR_RANGE);
  if (year === null || year.end - at !== 4 || text[year.end] !== " ") return false;
  return UPPERCASE.test(text.charAt(year.end + 1));
}

/** Reads `, <item>` at `at` for a later item, or null when it is refused. */
function readLaterItem(text: string, at: number, o: PinciteOptions): PinciteRead | null {
  const comma = readLiteral(text, at, ",");
  const start = comma === null ? null : readSpaces(text, comma);
  if (start === null || o.startsMember(text, start) || startsDatabaseYear(text, start)) {
    return null;
  }
  return readItem(text, start);
}

/**
 * Reads a Pincite_Expression whose first item starts at `at`. The caller has
 * already read any `, ` or ` at ` lead and applied its own first-item checks.
 */
export function readPinciteExpression(
  text: string,
  at: number,
  o: PinciteOptions,
): PinciteRead | null {
  const head = at < 0 ? null : readItem(text, at);
  if (head === null) return null;
  let end = head.end;
  for (let items = 1; o.list && items < MAX_PINCITE_ITEMS; items += 1) {
    const next = readLaterItem(text, end, o);
    if (next === null || next.end - at > MAX_PINCITE_LENGTH) break;
    end = next.end;
  }
  return { first: head.first, end };
}
