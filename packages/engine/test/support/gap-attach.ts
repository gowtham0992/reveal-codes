/**
 * Builders for Property 45 (task 5.26; Req 13.1, 13.9; design D19, D21).
 *
 * Every text is `t(m, x) = '"' + q + '"' + p1 + m + x`, so the quote's
 * content range is `[1, 1 + q.length)` and `x` starts at
 * `t.length − x.length` by construction. Whether the gap holds at most one
 * Sentence boundary is read from `segment` (via `sentencesOf`), as the design
 * states; `extract` is never used to compute an expectation. Kept here so
 * extract.properties.test.ts stays under the 300-line module limit.
 */
import fc from "fast-check";
import { expect } from "vitest";
import { extract } from "../../src/citations/extract";
import {
  arbCaseName,
  arbCitation,
  arbGapPunct,
  arbGapSignal,
  arbLongParty,
  arbQuoteContent,
  arbShortFormParty,
  canonical,
} from "../../src/testing/arbitraries";
import type { ReporterValue } from "../../src/types";
import { sentenceIndex, sentencesOf } from "./sentence-index";

/** The drawn pieces of one Property 45 case. */
export type GapCase = Readonly<{
  q: string;
  n: string;
  p1: string;
  /** `p1` redrawn so it does not end with `.`, used only for `att("", y)`. */
  p1y: string;
  p2: string;
  g: string;
  g2: string;
  c: ReporterValue;
  r: string;
  pg: number;
  long: string;
  /** Which side of `n` the long party replaces when neither carries digits. */
  longLeft: boolean;
}>;

const isReporter = (v: { kind: string }): v is ReporterValue => v.kind === "reporter";

export const arbGapCase: fc.Arbitrary<GapCase> = fc.record({
  q: arbQuoteContent,
  n: arbCaseName,
  p1: arbGapPunct,
  p1y: arbGapPunct.filter((p) => !p.endsWith(".")),
  p2: arbGapPunct,
  g: arbGapSignal,
  g2: arbGapSignal,
  c: arbCitation.filter(isReporter),
  r: arbShortFormParty,
  pg: fc.integer({ min: 1, max: 9999 }),
  long: arbLongParty,
  longLeft: fc.boolean(),
});

/**
 * `n` with one Party_Name replaced by `long` (over 80 code units). The
 * replaced side is the one holding `n`'s digit run, if any, so the result
 * keeps `arbCaseName`'s at-most-one-digit-run-per-side shape.
 */
export function longCaseName(n: string, long: string, longLeft: boolean): string {
  const v = n.indexOf(" v. ");
  const left = n.slice(0, v);
  const right = n.slice(v + 4, -1);
  const digits = /[0-9]/;
  const replaceLeft = digits.test(left) || (!digits.test(right) && longLeft);
  return replaceLeft ? `${long} v. ${right},` : `${left} v. ${long},`;
}

/** The Canonical_Form `f` and the party Short_Form `y` of a case. */
export function citingStrings(k: GapCase): Readonly<{ f: string; y: string }> {
  const y = `${k.r}, ${String(k.c.volume)} ${k.c.reporter} at ${String(k.pg)}`;
  return { f: canonical(k.c), y };
}

/** `'"' + q + '"' + p1 + m + x`. */
const text = (q: string, p1: string, m: string, x: string): string => `"${q}"${p1}${m}${x}`;

/** `att(m, x)`: one preceding quote on `x` when the gap spans ≤ 1 boundary, else none. */
function expectAtt(q: string, p1: string, m: string, x: string): void {
  const t = text(q, p1, m, x);
  const xStart = t.length - x.length;
  const s = sentencesOf(t);
  const near = sentenceIndex(s, xStart) - sentenceIndex(s, q.length + 1) <= 1;
  const want = { start: 1, end: 1 + q.length, text: q, citationStart: xStart, rule: "preceding" };
  expect({ m, x, quotes: extract(t).quotes }).toEqual({ m, x, quotes: near ? [want] : [] });
}

/** `extract(t(m, x)).quotes` is empty. */
function expectNone(q: string, p1: string, m: string, x: string): void {
  expect({ m, x, quotes: extract(text(q, p1, m, x)).quotes }).toEqual({ m, x, quotes: [] });
}

/** Property 45: every Attach, `In`, `with`, Two-Gap_Signal, and Over-long clause. */
export function expectGapAttachment(k: GapCase): void {
  const { q, n, p1, p2, g, g2 } = k;
  const { f, y } = citingStrings(k);
  expectAtt(q, p1, "", f);
  expectAtt(q, p1, n + p2, f);
  expectAtt(q, p1, `${g} `, f);
  expectAtt(q, p1, `${g} ${n}${p2}`, f);
  expectAtt(q, k.p1y, "", y);
  expectAtt(q, p1, `${g} `, y);
  expectNone(q, p1, "In ", y);
  expectNone(q, p1, `with ${n}${p2}`, f);
  expectNone(q, p1, `${g} with ${n}${p2}`, f);
  expectNone(q, p1, `${g} ${g2} ${n}${p2}`, f);
  expectNone(q, p1, `${g} ${g2} `, f);
  expectNone(q, p1, `${g} ${g2} `, y);
  const nl = longCaseName(n, k.long, k.longLeft);
  expectNone(q, p1, nl + p2, f);
  expectNone(q, p1, `${g} ${nl}${p2}`, f);
}
