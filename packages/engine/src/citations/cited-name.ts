/**
 * The Cited_Name written immediately before a Full_Citation (case-match
 * design, "Engine: the cited name"; Req 1.2 to 1.7, 1.13 to 1.15).
 *
 * `citedNameFor(text, start)` runs the Strict_Read (`partyStartFor` and
 * `isCaseName` from the existing rules, plus the In_Re_Name rule) and the
 * Tolerant_Read, a second reader over a larger token set. The strict result
 * stands, unless it is empty (then the tolerant result is used) or the
 * tolerant result is longer, ends with it, and the words it adds on the left
 * contain no token ending in a period (rule A; Req 1.15, D13).
 * `party.ts` and `case-name.ts` are not changed. Every function is total
 * and never throws.
 */

import { isCaseName, isPartyName, MAX_CASE_NAME } from "./case-name.js";
import { CONNECTORS, MAX_PARTY, PARTY_STOP_LIST, partyStartFor } from "./party.js";

/** Longest `caseName` from either read, in code units. */
const MAX_NAME = MAX_CASE_NAME - 1;

/** `In re ` plus a Party_Name. */
const IN_RE_WINDOW = MAX_PARTY + 6;

const NAME_TOKEN = /^\p{Lu}[\p{L}\p{N}'’.-]*$/u;
const DIGITS = /^[0-9]+$/;
const TOLERANT_CONNECTORS: ReadonlySet<string> = new Set([
  "of",
  "the",
  "and",
  "for",
  "&",
  "de",
  "la",
]);

const isSpace = (ch: string | undefined): boolean => ch !== undefined && /\s/.test(ch);

/** The offset of the comma that closes the name, when only whitespace separates it from `start`. */
function tailComma(text: string, start: number): number | null {
  if (!Number.isInteger(start) || start < 1 || start > text.length) return null;
  let i = start;
  while (i > 0 && isSpace(text[i - 1])) i -= 1;
  return i > 0 && text[i - 1] === "," ? i - 1 : null;
}

/** The In_Re_Name ending at the tail comma `c`, or undefined. */
function inReName(text: string, c: number): string | undefined {
  const lo = Math.max(0, c - IN_RE_WINDOW);
  const span = text.slice(lo, c);
  const found = Math.max(span.lastIndexOf("In re "), span.lastIndexOf("In Re "));
  if (found < 0) return undefined;
  const at = lo + found;
  const before = at === 0 ? undefined : text[at - 1];
  if (before !== undefined && !isSpace(before) && before !== "(") return undefined;
  return isPartyName(text, at + 6, c) ? text.slice(at, c) : undefined;
}

/** The Strict_Read: Case_Name by the Party_Run rule, else In_Re_Name. */
function strictName(text: string, c: number): string | undefined {
  const s = partyStartFor(text, c);
  if (s !== null && isCaseName(text, s, c + 1)) return text.slice(s, c);
  return inReName(text, c);
}

/** Whether `token` is a Name_Token, with one trailing comma allowed after a period. */
function isNameToken(token: string): boolean {
  const body = token.length > 2 && token.endsWith(".,") ? token.slice(0, -1) : token;
  return NAME_TOKEN.test(body);
}

/** The start of the token that ends at `end` (equal to `end` when empty). */
function tokenStart(text: string, end: number): number {
  let s = end;
  while (s > 0 && !isSpace(text[s - 1])) s -= 1;
  return s;
}

/** The start of `In` when `text[s ..]` is `re`/`Re` directly right of a whole-token `In `. */
function inBefore(text: string, s: number): number | null {
  if (s < 3 || text.slice(s - 3, s) !== "In ") return null;
  return s - 3 === 0 || isSpace(text[s - 4]) ? s - 3 : null;
}

type Scan = Readonly<{ left: number; inRe: boolean }>;

/** Scans left from the tail comma `c` over the tokens of the Tolerant_Read. */
function scanLeft(text: string, c: number): Scan {
  let left = c;
  let pos = c;
  let sawV = false;
  for (;;) {
    const s = tokenStart(text, pos);
    if (s === pos || c - s > MAX_NAME) break;
    const token = text.slice(s, pos);
    if (token === "re" || token === "Re") {
      const inAt = inBefore(text, s);
      if (inAt !== null && c - inAt <= MAX_NAME) return { left: inAt, inRe: true };
      if (token === "re") break;
    } else if (token === "v.") {
      if (sawV) break;
      sawV = true;
    } else if (!isNameToken(token) && !DIGITS.test(token) && !TOLERANT_CONNECTORS.has(token)) {
      break;
    }
    left = s;
    if (s === 0 || text[s - 1] !== " ") break;
    pos = s - 1;
  }
  return { left, inRe: false };
}

/** True when `words[i ..]` starts with `entry` and at least one word follows. */
function startsWithEntry(words: readonly string[], i: number, entry: readonly string[]): boolean {
  return i + entry.length < words.length && entry.every((w, k) => words[i + k] === w);
}

/** Index of the first word left after removing leading Party_Stop_List entries and Connectors. */
function trimmedIndex(words: readonly string[]): number {
  let i = 0;
  for (;;) {
    const entry = [...PARTY_STOP_LIST, ...CONNECTORS].find((e) => startsWithEntry(words, i, e));
    if (entry === undefined) return i;
    i += entry.length;
  }
}

/** The accepted words of a scan result, or undefined (Req 1.14). */
function acceptedName(text: string, scan: Scan, c: number): string | undefined {
  const words = text.slice(scan.left, c).split(" ");
  if (scan.inRe) return words.length >= 3 ? words.join(" ") : undefined;
  const rest = words.slice(trimmedIndex(words));
  const v = rest.indexOf("v.");
  return v >= 1 && v < rest.length - 1 ? rest.join(" ") : undefined;
}

/** The Tolerant_Read at the tail comma `c`. */
function tolerantName(text: string, c: number): string | undefined {
  return acceptedName(text, scanLeft(text, c), c);
}

/**
 * The Cited_Name written immediately before the Full_Citation that starts at
 * `start`, without its closing comma and without a lead-in word, or
 * undefined when there is none.
 */
export function citedNameFor(text: string, start: number): string | undefined {
  const c = tailComma(text, start);
  if (c === null) return undefined;
  const strict = strictName(text, c);
  const tolerant = tolerantName(text, c);
  if (strict === undefined) return tolerant;
  return extendsStrictSafely(strict, tolerant) ? tolerant : strict;
}

/**
 * Rule A (Req 1.15, D13): the tolerant result replaces the strict one only
 * when it is longer, ends with it, and the words it adds on the left contain
 * no token ending in a period. A period-ending word cannot be told from the
 * end of a sentence, so such an extension would make the name change when an
 * earlier sentence is edited.
 */
function extendsStrictSafely(strict: string, tolerant: string | undefined): boolean {
  if (tolerant === undefined || tolerant.length <= strict.length || !tolerant.endsWith(strict)) {
    return false;
  }
  const added = tolerant.slice(0, tolerant.length - strict.length).split(/\s+/);
  return !added.some((w) => w.endsWith("."));
}
