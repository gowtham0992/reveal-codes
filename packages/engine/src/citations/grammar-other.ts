/**
 * Other_Reference grammar (design A9 step 5, decision D8; Req 9.6).
 *
 * v1 recognises three forms and nothing else:
 *
 * - `<title> U.S.C. §[§] <section>`
 * - `<title> C.F.R. §[§] <section>`
 * - `Fed. R. (Civ.|Crim.|App.|Bankr.) P. <rule>` and `Fed. R. Evid. <rule>`
 *
 * Tokens are separated by exactly one U+0020 space. A title is an integer
 * with no leading zero in `TITLE_RANGE`. A section or rule starts with a
 * digit 1–9, continues with ASCII letters and digits, may contain `.` or `-`
 * only between two such characters (so a sentence-final `.` is not taken),
 * and may end with adjacent subdivisions such as `(b)(6)`. A section longer
 * than `MAX_SECTION` is not a reference; the read never takes a prefix.
 *
 * `matchOtherAt` checks the Req 9.8 word boundary on both sides itself. The
 * Full_Citation precedence look-ahead of A9 step 5 ("no reporter or
 * database match starts in `(p, end)`") belongs to `scan.ts`, which owns
 * `matchAt`. A match is at most about 60 code units long, well inside
 * `MAX_MATCH`; the only read behind `p` is `text[p − 2 .. p)` for the
 * boundary. Never throws.
 */

import type { OtherValue } from "../types.js";
import { isAsciiDigitAt, isWordCharAt, isWordCharBefore, readInt, readLiteral } from "./lex.js";
import type { IntRange } from "./lex.js";

/** A recognised Other_Reference: `[start, end)` and its value. */
export type OtherMatch = Readonly<{ start: number; end: number; value: OtherValue }>;

/** U.S.C. and C.F.R. title numbers (U.S.C. has 54 titles, C.F.R. 50). */
export const TITLE_RANGE: IntRange = { min: 1, max: 999 };

/** Longest section or rule designator, subdivisions included. */
export const MAX_SECTION = 40;

/** Longest subdivision content, as in the `b` of `(b)`. */
const MAX_SUBDIVISION = 8;

/** Federal Rules sets after `Fed. R. `, each with its trailing space. */
const FED_RULE_SETS: readonly string[] = [
  "Civ. P. ",
  "Crim. P. ",
  "App. P. ",
  "Bankr. P. ",
  "Evid. ",
];

const CODE_1 = 49;

function isAsciiAlnumAt(text: string, i: number): boolean {
  const u = text.charCodeAt(i);
  return (u >= 48 && u <= 57) || (u >= 65 && u <= 90) || (u >= 97 && u <= 122);
}

/** Reads `(x)` with 1 to `MAX_SUBDIVISION` ASCII letters or digits. */
function readSubdivision(text: string, at: number): number | null {
  if (text[at] !== "(") return null;
  let i = at + 1;
  while (isAsciiAlnumAt(text, i) && i - at - 1 < MAX_SUBDIVISION) i += 1;
  if (i === at + 1 || text[i] !== ")") return null;
  return i + 1;
}

/** Reads the designator core: `1983`, `2000e-2`, `240.10b-5`. */
function readSectionCore(text: string, at: number): number {
  let i = at;
  for (;;) {
    if (isAsciiAlnumAt(text, i)) i += 1;
    else if ((text[i] === "." || text[i] === "-") && isAsciiAlnumAt(text, i + 1)) i += 2;
    else return i;
    if (i - at > MAX_SECTION) return i;
  }
}

/**
 * Reads a section or rule designator at `at` and returns its end, or `null`
 * when there is none, it exceeds `MAX_SECTION`, or a letter or number
 * follows it (Req 9.8). Reads at most `MAX_SECTION + MAX_SUBDIVISION + 3`
 * code units.
 */
export function readSection(text: string, at: number): number | null {
  if (at < 0 || !isAsciiDigitAt(text, at) || text.charCodeAt(at) < CODE_1) return null;
  let end = readSectionCore(text, at);
  for (;;) {
    if (end - at > MAX_SECTION) return null;
    const next = readSubdivision(text, end);
    if (next === null) break;
    end = next;
  }
  if (end - at > MAX_SECTION || isWordCharAt(text, end)) return null;
  return end;
}

/** Reads `§ ` or `§§ ` at `at`. */
function readSectionSign(text: string, at: number): number | null {
  return readLiteral(text, at, "§§ ") ?? readLiteral(text, at, "§ ");
}

/** `<title> U.S.C. §[§] <section>` or the C.F.R. form at `p`. */
function matchCodeAt(text: string, p: number): OtherMatch | null {
  const title = readInt(text, p, TITLE_RANGE);
  if (title === null) return null;
  const usc = readLiteral(text, title.end, " U.S.C. ");
  const cfr = usc === null ? readLiteral(text, title.end, " C.F.R. ") : null;
  const afterCode = usc ?? cfr;
  if (afterCode === null) return null;
  const sectionStart = readSectionSign(text, afterCode);
  if (sectionStart === null) return null;
  const end = readSection(text, sectionStart);
  if (end === null) return null;
  const form = usc !== null ? "usc" : "cfr";
  const value: OtherValue = {
    kind: "other",
    form,
    title: title.value,
    section: text.slice(sectionStart, end),
  };
  return { start: p, end, value };
}

/** `Fed. R. <set> <rule>` at `p`. */
function matchFedRuleAt(text: string, p: number): OtherMatch | null {
  const afterPrefix = readLiteral(text, p, "Fed. R. ");
  if (afterPrefix === null) return null;
  for (const set of FED_RULE_SETS) {
    const ruleStart = readLiteral(text, afterPrefix, set);
    if (ruleStart === null) continue;
    const end = readSection(text, ruleStart);
    if (end === null) return null;
    const value: OtherValue = {
      kind: "other",
      form: "fed_rule",
      section: text.slice(ruleStart, end),
    };
    return { start: p, end, value };
  }
  return null;
}

/**
 * Matches an Other_Reference starting exactly at `p`, or returns `null`.
 * Fails when the code point before `p` is a letter or number (Req 9.8).
 */
export function matchOtherAt(text: string, p: number): OtherMatch | null {
  if (p < 0 || p >= text.length || isWordCharBefore(text, p)) return null;
  return isAsciiDigitAt(text, p) ? matchCodeAt(text, p) : matchFedRuleAt(text, p);
}
