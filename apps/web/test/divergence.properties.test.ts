import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { arbQuotationParts, joinQuotation } from "../../../packages/engine/src/testing/arbitraries";
import type { QuotationParts } from "../../../packages/engine/src/testing/arbitraries";
import { divergenceSentence, divergenceWords } from "../src/client/divergence";
import { runs } from "./support/fc";

const SPACE = new Set([" ", "\t", "\n", "\u2003"]);

type Span = { start: number; end: number; text: string };

/** Words by scanning code units, with no regular expression. */
function scan(text: string): Span[] {
  const spans: Span[] = [];
  let start = -1;
  for (let i = 0; i <= text.length; i++) {
    const blank = i === text.length || SPACE.has(text.charAt(i));
    if (!blank && start < 0) start = i;
    if (blank && start >= 0) {
      spans.push({ start, end: i, text: text.slice(start, i) });
      start = -1;
    }
  }
  return spans;
}

function expectedFirst(spans: readonly Span[], at: number): number {
  for (let i = 0; i < spans.length; i++) {
    const s = spans[i];
    if (s !== undefined && s.start <= at && at < s.end) return i;
  }
  for (let i = 0; i < spans.length; i++) {
    const s = spans[i];
    if (s !== undefined && s.start >= at) return i;
  }
  return spans.length - 1;
}

/** The text before ", then differs" (or the whole fixed lead for the first-word form). */
function head(s: string): string {
  const cut = s.indexOf('", then differs');
  return cut >= 0 ? s.slice(0, cut) : s.slice(0, s.indexOf(': "'));
}

/** Clause 1: no exclamation mark, and the text outside the quoted words is plain. */
function checkPlain(s: string): string[] {
  expect(s).not.toContain("!");
  const pieces = s.split('"');
  pieces.forEach((piece, i) => {
    if (i % 2 === 0) expect(piece).toMatch(/^[A-Za-z ,:.\u2026]*$/);
  });
  return pieces;
}

/** Clauses 2, 3 and 4: the form, the tail and the differing words. */
function checkForm(text: string, spans: readonly Span[], prefix: number, s: string): void {
  const pieces = checkPlain(s);
  const first = expectedFirst(spans, prefix);
  const differing = divergenceWords(text, prefix);
  const wordTexts = spans.map((w) => w.text);
  if (first === 0) {
    expect(s).toBe(`Differs from the opinion from the first word: "${differing}"`);
  } else {
    const tailWords = wordTexts.slice(Math.max(0, first - 3), first);
    const lead = first > 3 ? "\u2026 " : "";
    expect(s).toBe(
      `Matches the opinion up to "${lead}${tailWords.join(" ")}", then differs: "${differing}"`,
    );
    expect(tailWords.length).toBeLessThanOrEqual(3);
    expect(pieces[1]).toBe(`${lead}${tailWords.join(" ")}`);
  }
  const shown = (pieces[pieces.length - 2] ?? "").replace(/\u2026$/, "");
  const shownWords = shown.split(" ");
  expect(shownWords.length).toBeLessThanOrEqual(6);
  expect(shownWords).toEqual(wordTexts.slice(first, first + shownWords.length));
}

/** Clause 5: the lead does not depend on the gaps or on words added after the quotation. */
function checkStable(parts: QuotationParts, first: number, s: string): void {
  const other = joinQuotation(parts.words, parts.otherGaps);
  const otherStart = scan(other)[first]?.start ?? 0;
  const grown = joinQuotation(
    [...parts.words, ...parts.extra],
    [...parts.otherGaps.slice(0, parts.words.length), " ", ...parts.extra.map(() => " ")],
  );
  const grownStart = scan(grown)[first]?.start ?? 0;
  expect(head(divergenceSentence(other, otherStart))).toBe(head(s));
  expect(head(divergenceSentence(grown, grownStart))).toBe(head(s));
}

function checkSentence(parts: QuotationParts, n: number): void {
  const text = joinQuotation(parts.words, parts.gaps);
  const prefix = n % (text.length + 1);
  const spans = scan(text);
  const s = divergenceSentence(text, prefix);
  if (spans.length === 0) {
    expect(s).toBe("");
    return;
  }
  checkForm(text, spans, prefix, s);
  checkStable(parts, expectedFirst(spans, prefix), s);
}

describe("divergence sentence _Requirements: 27.1, 27.4, 27.5, 27.6, 27.7, 27.8, 27.9, 27.10, 27.11, 27.12, 27.14_", () => {
  // Property 4
  it("P4 the sentence follows the word index, the tail and the differing words", () => {
    fc.assert(
      fc.property(arbQuotationParts, fc.nat(), (parts, n) => {
        checkSentence(parts, n);
      }),
      { numRuns: runs() },
    );
  });
});
