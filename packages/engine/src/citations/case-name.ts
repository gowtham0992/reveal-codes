/**
 * Party_Name and Case_Name checks and the preceding-quote gap matcher
 * (Glossary Party_Name, Case_Name, Gap_Signal, Entity_Suffix,
 * Legal_Abbreviation, Single_Capital_Initial; Req 13.1, 13.9; design A9,
 * "Gap matcher"; D9, D10, D19, D21).
 *
 * Every function reads only inside the range it is given and never throws.
 */

import { abbreviationsStartingAt } from "../abbreviations.js";
import { MAX_PARTY } from "./party.js";
import { LEGAL_ABBREVIATION_INDEX } from "./reporters.js";
import { GAP_SIGNALS, gapSignalsAt, startsWithSignal } from "./signals.js";

/** Longest Case_Name: two Party_Names, ` v. `, and the closing `,`. */
export const MAX_CASE_NAME = 2 * MAX_PARTY + 4 + 1;

/** Shortest Case_Name, `a v. b,`. */
export const MIN_CASE_NAME = 7;

const V = " v. ";
const LETTER = /^\p{L}$/u;
const isDigit = (u: string): boolean => u >= "0" && u <= "9";
const isLetter = (u: string): boolean => u.length === 1 && LETTER.test(u);
const isAsciiCapital = (u: string): boolean => u >= "A" && u <= "Z" && u.length === 1;
const PUNCT: ReadonlySet<string> = new Set([".", ",", "'", "’", "&", "-", " "]);
const isPartyUnit = (u: string): boolean => isLetter(u) || isDigit(u) || PUNCT.has(u);

/** Gap punctuation: whitespace or one of `, ; : . ( )` (Req 13.1). */
const GAP_PUNCT: ReadonlySet<string> = new Set([",", ";", ":", ".", "(", ")"]);
const isP = (u: string): boolean => GAP_PUNCT.has(u) || /^\s$/.test(u);

/** `with` and every lowercase-first Gap_Signal (D19). */
const GAP_LEADING_WORDS: readonly string[] = [
  "with",
  ...GAP_SIGNALS.filter((s) => /^[a-z]/.test(s)),
];

function isRange(text: string, s: number, t: number): boolean {
  return Number.isInteger(s) && Number.isInteger(t) && s >= 0 && s <= t && t <= text.length;
}

/** Character set, first and last code unit, and no double space. */
function hasPartyShape(text: string, s: number, t: number): boolean {
  const first = text.charAt(s);
  const last = text.charAt(t - 1);
  if (!(isLetter(first) || isDigit(first)) || last === " " || last === ",") return false;
  for (let i = s; i < t; i++) {
    const u = text.charAt(i);
    if (!isPartyUnit(u)) return false;
    if (u === " " && i + 1 < t && text.charAt(i + 1) === " ") return false;
  }
  return true;
}

/** Marks every `.` inside a Legal_Abbreviation occurrence at a word start (D9). */
function markAbbreviationPeriods(text: string, s: number, t: number): ReadonlySet<number> {
  const marked = new Set<number>();
  for (let j = s; j < t; j++) {
    if (j !== s && text.charAt(j - 1) !== " ") continue;
    for (const end of abbreviationsStartingAt(text, j, t, LEGAL_ABBREVIATION_INDEX)) {
      for (let k = j; k < end; k++) if (text.charAt(k) === ".") marked.add(k);
    }
  }
  return marked;
}

/** The `.` at `i` closes a Single_Capital_Initial. */
function closesInitial(text: string, s: number, i: number): boolean {
  const c = i - 1;
  return c >= s && isAsciiCapital(text.charAt(c)) && (c === s || text.charAt(c - 1) === " ");
}

function periodsAllowed(text: string, s: number, t: number): boolean {
  let marked: ReadonlySet<number> | null = null;
  for (let i = s; i < t; i++) {
    if (text.charAt(i) !== "." || closesInitial(text, s, i)) continue;
    marked ??= markAbbreviationPeriods(text, s, t);
    if (!marked.has(i)) return false;
  }
  return true;
}

/** D10: a digit, a space, one or more code units, a space, and a digit. */
function hasDigitPattern(text: string, s: number, t: number): boolean {
  let first = -1;
  for (let i = s; i + 1 < t && first < 0; i++) {
    if (isDigit(text.charAt(i)) && text.charAt(i + 1) === " ") first = i;
  }
  if (first < 0) return false;
  for (let k = t - 1; k >= first + 4; k--) {
    if (isDigit(text.charAt(k)) && text.charAt(k - 1) === " ") return true;
  }
  return false;
}

/** Glossary Party_Name over `text[start .. end)` (D9, D10). */
export function isPartyName(text: string, start: number, end: number): boolean {
  if (!isRange(text, start, end)) return false;
  const length = end - start;
  if (length < 1 || length > MAX_PARTY) return false;
  if (!hasPartyShape(text, start, end)) return false;
  const inner = text.indexOf(V, start);
  if (inner >= 0 && inner + V.length <= end) return false;
  if (startsWithSignal(text, start, end)) return false;
  return periodsAllowed(text, start, end) && !hasDigitPattern(text, start, end);
}

type Sides = Readonly<{ left: readonly [number, number]; right: readonly [number, number] }>;

/** Splits `[start, end − 1)` on its only ` v. `, or null. */
function splitCaseName(text: string, start: number, end: number): Sides | null {
  if (!isRange(text, start, end) || end - start < MIN_CASE_NAME) return null;
  if (text.charAt(end - 1) !== ",") return null;
  const body = end - 1;
  const k = text.indexOf(V, start);
  if (k < 0 || k + V.length > body) return null;
  const again = text.indexOf(V, k + 1);
  if (again >= 0 && again + V.length <= body) return null;
  return { left: [start, k], right: [k + V.length, body] };
}

/** Glossary Case_Name over `text[start .. end)`. */
export function isCaseName(text: string, start: number, end: number): boolean {
  const sides = splitCaseName(text, start, end);
  if (sides === null) return false;
  const [ls, le] = sides.left;
  const [rs, re] = sides.right;
  return isPartyName(text, ls, le) && isPartyName(text, rs, re);
}

/** The party begins with `with` or a lowercase-first Gap_Signal (D19). */
function beginsWithGapWord(text: string, s: number, t: number): boolean {
  for (const word of GAP_LEADING_WORDS) {
    const e = s + word.length;
    if (e > t || !text.startsWith(word, s)) continue;
    if (e === t || text.charAt(e) === " " || text.charAt(e) === ",") return true;
  }
  return false;
}

/** `isCaseName` plus the gap's leading-word rule (D19). */
export function isGapCaseName(text: string, start: number, end: number): boolean {
  if (!isCaseName(text, start, end)) return false;
  const sides = splitCaseName(text, start, end);
  if (sides === null) return false;
  const [ls, le] = sides.left;
  const [rs, re] = sides.right;
  return !beginsWithGapWord(text, ls, le) && !beginsWithGapWord(text, rs, re);
}

/** End of the maximal `isP` run starting at `from`, stopping at `limit`. */
function skipP(text: string, from: number, limit: number): number {
  let i = from;
  while (i < limit && isP(text.charAt(i))) i++;
  return i;
}

/** A Case_Name starts at `x` and ends with a `,` at or after `z`. */
function caseAt(text: string, x: number, z: number, g1: number): boolean {
  const hi = Math.min(g1, x + MAX_CASE_NAME);
  for (let e = Math.max(z + 1, x + MIN_CASE_NAME); e <= hi; e++) {
    if (text.charAt(e - 1) === "," && isGapCaseName(text, x, e)) return true;
  }
  return false;
}

/**
 * True when `text[g0 .. g1)` is `P1 + S + P2 + C + P3` (Req 13.1): `P*` gap
 * punctuation, `S` empty or one Gap_Signal, `C` empty or one Case_Name.
 * `S` is only the longest Gap_Signal at the end of `P1` (D21), so the rest
 * of a longer signal (`also See …`) is never read as a Case_Name.
 */
export function matchPrecedingGap(text: string, g0: number, g1: number): boolean {
  if (!isRange(text, g0, g1)) return false;
  const a = skipP(text, g0, g1);
  if (a === g1) return true;
  let z = g1;
  while (z > a && isP(text.charAt(z - 1))) z--;
  if (caseAt(text, a, z, g1)) return true;
  const b = gapSignalsAt(text, a, g1).at(-1);
  if (b === undefined) return false;
  const a2 = skipP(text, b, g1);
  return a2 === g1 || caseAt(text, a2, z, g1);
}
