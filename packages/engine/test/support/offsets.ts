/**
 * Helpers for Property 17 (extraction offsets are exact on any string).
 * Kept here so extract.properties.test.ts stays under the 300-line module
 * limit.
 */
import fc from "fast-check";
import { expect } from "vitest";
import {
  arbAnyString,
  arbOpinionWithQuotes,
  arbTextWithCitations,
} from "../../src/testing/arbitraries";
import type { ExtractedCitation, ExtractedQuote } from "../../src/types";

type Ranged = Readonly<{ start: number; end: number; text: string }>;

/** Every item is the exact slice it claims, and items are sorted and pairwise disjoint. */
export function expectExactSortedDisjoint(text: string, items: readonly Ranged[]): void {
  items.forEach((item, i) => {
    expect(text.slice(item.start, item.end)).toBe(item.text);
    const prev = items[i - 1];
    if (prev !== undefined) expect(prev.end).toBeLessThanOrEqual(item.start);
  });
}

/** The marks around `[start, end)` are one straight pair or one curly pair. */
function marksAround(text: string, q: ExtractedQuote): string {
  return (text[q.start - 1] ?? "") + (text[q.end] ?? "");
}

/** One quote: content, marks, a unique non-Other target, and the side it sits on. */
export function expectQuoteWellFormed(
  text: string,
  citations: readonly ExtractedCitation[],
  q: ExtractedQuote,
): void {
  expect(q.text).toMatch(/\S/);
  expect(['""', "“”"]).toContain(marksAround(text, q));
  const targets = citations.filter((c) => c.start === q.citationStart);
  expect(targets).toHaveLength(1);
  const target = targets[0];
  if (target === undefined) return;
  expect(target.value.kind).not.toBe("other");
  if (q.rule === "preceding") expect(q.end).toBeLessThan(target.start);
  else expect(q.start - 1).toBeGreaterThanOrEqual(target.end);
}

/** Any string, a constructed citing text, or an opinion body with quotations. */
export const arbExtractInput: fc.Arbitrary<string> = fc.oneof(
  arbAnyString,
  arbTextWithCitations.map((t) => t.text),
  arbOpinionWithQuotes.map((o) => o.text),
);
