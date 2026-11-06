/**
 * Builders for Property 47 (task 5.28; Req 13.5, 13.7).
 *
 * Every text is `t = f1 + g1 + '"' + q1 + '"' + p + f2 + g2 + '"' + q2 + '"'`,
 * so both quotes' content ranges and `f2`'s start Offset follow by
 * construction. `q1` satisfies Req 13.8 for `f1` (same Sentence, gap from
 * the follow set) and Req 13.1 for `f2` (gap `p` with no `.`, at most one
 * boundary from a final `.` in `q1`); `q2` satisfies 13.8 for `f2`. Those
 * Sentence conditions are read from `segment` (via `sentencesOf`) and
 * asserted, so a construction that misses one fails rather than passing
 * vacuously; `extract` is never used to compute an expectation.
 *
 * `f1` and `f2` are drawn only from Full_Citations that do not end in a
 * terminator sequence (`endsWithTerminator`, e.g. a `(D.)` court): one
 * followed by a space ends its Sentence (Req 8.3, 8.10), which would move
 * the opening mark after it into the next Sentence and break 13.8.
 */
import fc from "fast-check";
import { expect } from "vitest";
import { extract } from "../../src/citations/extract";
import {
  arbCitation,
  arbFollowGap,
  arbGapPunct,
  arbQuoteContent,
  canonical,
  endsWithTerminator,
} from "../../src/testing/arbitraries";
import type { FullValue } from "../../src/types";
import { sentenceIndex, sentencesOf } from "./sentence-index";

/** The drawn pieces of one Property 47 case. */
export type BothCase = Readonly<{
  f1: FullValue;
  f2: FullValue;
  g1: string;
  p: string;
  g2: string;
  q1: string;
  q2: string;
}>;

/** Full_Citations whose canonical form does not end a Sentence before a space. */
const arbNonTerminalCitation: fc.Arbitrary<FullValue> = arbCitation.filter(
  (value) => !endsWithTerminator({ kind: "full", value, text: canonical(value) }),
);

export const arbBothCase: fc.Arbitrary<BothCase> = fc.record({
  f1: arbNonTerminalCitation,
  f2: arbNonTerminalCitation,
  g1: arbFollowGap,
  p: arbGapPunct.filter((s) => !s.includes(".")),
  g2: arbFollowGap,
  q1: arbQuoteContent,
  q2: arbQuoteContent,
});

/** The text of a case and the Offsets its expectation needs, all by construction. */
export type BothLayout = Readonly<{
  t: string;
  open1: number;
  close1: number;
  f2Start: number;
  open2: number;
}>;

export function layout(k: BothCase): BothLayout {
  const f1 = canonical(k.f1);
  const f2 = canonical(k.f2);
  const open1 = f1.length + k.g1.length;
  const close1 = open1 + 1 + k.q1.length;
  const f2Start = close1 + 1 + k.p.length;
  const open2 = f2Start + f2.length + k.g2.length;
  const t = `${f1}${k.g1}"${k.q1}"${k.p}${f2}${k.g2}"${k.q2}"`;
  return { t, open1, close1, f2Start, open2 };
}

/** Sentence boundaries from `q1`'s closing mark to `f2`'s start, from `segment`. */
export function precedingBoundaries(t: string, close1: number, f2Start: number): number {
  const s = sentencesOf(t);
  return sentenceIndex(s, f2Start) - sentenceIndex(s, close1);
}

/** The construction meets 13.1 for `q1`→`f2`, 13.8 for `q1`→`f1`, and 13.8 for `q2`→`f2`. */
function expectBothRulesHold(k: BothCase, l: BothLayout): void {
  const s = sentencesOf(l.t);
  const at = (x: number): number => sentenceIndex(s, x);
  expect({ t: l.t, f1: at(0) === at(l.open1), f2: at(l.f2Start) === at(l.open2) }).toEqual({
    t: l.t,
    f1: true,
    f2: true,
  });
  const b = precedingBoundaries(l.t, l.close1, l.f2Start);
  expect({ t: l.t, b: b >= 0 && b <= 1 }).toEqual({ t: l.t, b: true });
  expect(canonical(k.f1).length > 0 && canonical(k.f2).length > 0).toBe(true);
}

/** Property 47: `q1` on `f2` by the preceding rule, `q2` on `f2` by the following rule. */
export function expectPrecedingWins(k: BothCase): void {
  const l = layout(k);
  expectBothRulesHold(k, l);
  const q1 = { start: l.open1 + 1, end: l.close1, text: k.q1, citationStart: l.f2Start };
  const q2s = l.open2 + 1;
  const q2 = { start: q2s, end: q2s + k.q2.length, text: k.q2, citationStart: l.f2Start };
  const quotes = extract(l.t).quotes;
  expect({ t: l.t, quotes }).toEqual({
    t: l.t,
    quotes: [
      { ...q1, rule: "preceding" },
      { ...q2, rule: "following" },
    ],
  });
  expect(quotes.some((q) => q.citationStart === 0)).toBe(false);
}
