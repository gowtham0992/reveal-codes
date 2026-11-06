/**
 * Builders for Property 46 (task 5.27; Req 13.8, 13.9).
 *
 * Every text is `t = w + " " + x + g + '"' + q + '"'`, so the attached
 * citation starts at `w.length + 1 + x.citationStart`, the opening mark sits
 * at `t.length − q.length − 2`, and the quote's content range follows it, all
 * by construction. Whether the citation's start and the opening mark share a
 * Sentence is read from `segment` (via `sentencesOf`), as the design states;
 * `extract` is never used to compute an expectation.
 */
import fc from "fast-check";
import { expect } from "vitest";
import { extract } from "../../src/citations/extract";
import {
  arbCitingString,
  arbFollowGap,
  arbGapSignal,
  arbProseWords,
  arbQuoteContent,
  type CitingString,
} from "../../src/testing/arbitraries";
import { sentenceIndex, sentencesOf } from "./sentence-index";

/** The drawn pieces of one Property 46 case. */
export type FollowCase = Readonly<{
  w: string;
  x: CitingString;
  g: string;
  q: string;
  /** One code unit outside the following-gap set: a letter, `.`, `!`, or `?`. */
  u: string;
  /** A Gap_Signal, capitalised or lowercase-first. */
  s: string;
}>;

const asciiLetter: fc.Arbitrary<string> = fc
  .oneof(fc.integer({ min: 0x41, max: 0x5a }), fc.integer({ min: 0x61, max: 0x7a }))
  .map((c) => String.fromCharCode(c));

export const arbFollowCase: fc.Arbitrary<FollowCase> = fc.record({
  w: arbProseWords,
  x: arbCitingString,
  g: arbFollowGap,
  q: arbQuoteContent,
  u: fc.oneof(asciiLetter, fc.constantFrom(".", "!", "?")),
  s: arbGapSignal,
});

const text = (w: string, x: string, g: string, q: string): string => `${w} ${x}${g}"${q}"`;

/** `g` with `ins` inserted at each position `0..g.length`. */
const insertions = (g: string, ins: string): string[] =>
  Array.from({ length: g.length + 1 }, (_, i) => g.slice(0, i) + ins + g.slice(i));

/** One following quote on `x` when its start shares a Sentence with the opening mark, else none. */
function expectFollow(k: FollowCase): void {
  const t = text(k.w, k.x.text, k.g, k.q);
  const citationStart = k.w.length + 1 + k.x.citationStart;
  const open = t.length - k.q.length - 2;
  const s = sentencesOf(t);
  const same = sentenceIndex(s, citationStart) === sentenceIndex(s, open);
  const want = { start: open + 1, end: open + 1 + k.q.length, text: k.q, citationStart };
  const quotes = same ? [{ ...want, rule: "following" }] : [];
  expect({ t, quotes: extract(t).quotes }).toEqual({ t, quotes });
}

/** `extract(t).quotes` is empty for each insertion of `ins` into `g`. */
function expectNoneWith(k: FollowCase, ins: string): void {
  for (const g of insertions(k.g, ins)) {
    const t = text(k.w, k.x.text, g, k.q);
    expect({ t, quotes: extract(t).quotes }).toEqual({ t, quotes: [] });
  }
}

/** Property 46: the attach clause, the one-code-unit clause, and the Gap_Signal clause. */
export function expectFollowAttachment(k: FollowCase): void {
  expectFollow(k);
  expectNoneWith(k, k.u);
  expectNoneWith(k, `${k.s} `);
}
