/**
 * Property 15 reference model (Req 8.3, 8.5, 8.6, 8.10): Sentence boundaries
 * written from the requirements, independent of `src/boundary.ts`.
 */
import { LEGAL_ABBREVIATIONS } from "../../src/abbreviations";
import type { CitationRange } from "../../src/boundary";
import { REPORTERS } from "../../src/citations/reporters";

const WS = /\s/;
const CLOSERS = new Set(['"', "”", "'", "’", ")"]);
const TERMINATORS = new Set([".", "?", "!"]);

/** The Glossary's Legal_Abbreviations: the fixed list plus every Reporter_List entry. */
const ALL_ABBREVIATIONS: ReadonlySet<string> = new Set([...LEGAL_ABBREVIATIONS, ...REPORTERS]);
const PERIOD_ABBREVIATIONS = [...ALL_ABBREVIATIONS].filter((a) => a.endsWith("."));

/** Reference Req 8.3: the index of the terminator run's last unit before `b`, or -1. */
function refTerminatorEnd(text: string, b: number): number {
  if (WS.test(text.charAt(b)) || !WS.test(text.charAt(b - 1))) return -1;
  let i = b - 1;
  while (i >= 0 && WS.test(text.charAt(i))) i -= 1;
  while (i >= 0 && CLOSERS.has(text.charAt(i))) i -= 1;
  return i >= 0 && TERMINATORS.has(text.charAt(i)) ? i : -1;
}

/** Reference Req 8.6: `text[i]` ends a Legal_Abbreviation preceded by start, whitespace, or `(`. */
export function refAbbreviationEnds(text: string, i: number): boolean {
  return PERIOD_ABBREVIATIONS.some((a) => {
    const s = i - a.length + 1;
    if (s < 0 || text.slice(s, i + 1) !== a) return false;
    return s === 0 || WS.test(text.charAt(s - 1)) || text.charAt(s - 1) === "(";
  });
}

/** The Legal_Abbreviations ending in `.`, the abbreviation part of a Capitalised_Word. */
const PERIOD_ABBREVIATION_SET: ReadonlySet<string> = new Set(PERIOD_ABBREVIATIONS);

/** Reference Glossary Capitalised_Word: its abbreviation part ends in `.` and is not `v.`. */
function refIsCapitalisedWord(word: string): boolean {
  if (/^\p{Lu}[\p{L}0-9'’-]*$/u.test(word) || /^[A-Z]\.$/.test(word)) return true;
  return word !== "v." && PERIOD_ABBREVIATION_SET.has(word);
}

const W_RUN = /[\p{L}0-9.'’-]*/uy;

/** Reference Req 8.10: `text[i]` is an initial's `.` before one space and a Capitalised_Word other than `Id.`. */
function refInitialExcluded(text: string, i: number): boolean {
  if (text.charAt(i) !== "." || !/^[A-Z]$/.test(text.charAt(i - 1))) return false;
  if (i >= 2 && text.charAt(i - 2) !== " ") return false;
  if (text.charAt(i + 1) !== " ") return false;
  W_RUN.lastIndex = i + 2;
  const word = W_RUN.exec(text)?.[0] ?? "";
  return word !== "Id." && refIsCapitalisedWord(word);
}

export const strictlyInside = (b: number, ranges: readonly CitationRange[]): boolean =>
  ranges.some((r) => r.start < b && b < r.end);

/** Reference model of Req 8.3, 8.5, 8.6, and 8.10: every interior boundary, ascending. */
export function refBoundaries(text: string, ranges: readonly CitationRange[]): number[] {
  const out: number[] = [];
  for (let b = 1; b < text.length; b += 1) {
    const i = refTerminatorEnd(text, b);
    if (i < 0 || strictlyInside(b, ranges)) continue;
    if (refAbbreviationEnds(text, i) || refInitialExcluded(text, i)) continue;
    out.push(b);
  }
  return out;
}
