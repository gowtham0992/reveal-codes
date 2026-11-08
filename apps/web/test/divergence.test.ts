import { createDocument, setQuoteCheck } from "@reveal-codes/engine";
import type { Document, QuoteCheckResult } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { divergenceWords, mismatchAt } from "../src/client/divergence";

const ISO = "2026-01-01T00:00:00.000Z";
const TEXT = "alpha beta gamma delta epsilon zeta eta theta";

describe("divergenceWords _Requirements: 13.6, 18.11_", () => {
  it("starts at the first word when prefixLength is 0", () => {
    expect(divergenceWords(TEXT, 0)).toBe("alpha beta gamma delta epsilon zeta…");
  });

  it("starts at the word containing prefixLength", () => {
    expect(divergenceWords(TEXT, 8)).toBe("beta gamma delta epsilon zeta eta…");
    expect(divergenceWords(TEXT, 6)).toBe("beta gamma delta epsilon zeta eta…");
  });

  it("starts at the next word when prefixLength falls in whitespace", () => {
    expect(divergenceWords("one  two three", 4)).toBe("two three");
  });

  it("falls back to the last word at the text length", () => {
    expect(divergenceWords("one two three", 13)).toBe("three");
  });

  it("adds an ellipsis only when more than six words remain", () => {
    expect(divergenceWords("a b c d e f g", 0)).toBe("a b c d e f…");
    expect(divergenceWords("a b c d e f", 0)).toBe("a b c d e f");
  });

  it("returns the empty string for empty or blank text", () => {
    expect(divergenceWords("", 0)).toBe("");
    expect(divergenceWords("   ", 1)).toBe("");
  });
});

const FIXTURE =
  'See Roe v. Wade, 410 U.S. 113, 120 (1973) ("the quick brown fox jumps over the lazy dog").';

function withResult(result: QuoteCheckResult): Document {
  const created = createDocument(FIXTURE, ISO);
  if (!created.ok) throw new Error("fixture document rejected");
  const quote = created.value.quotes[0];
  if (quote === undefined) throw new Error("fixture has no quote");
  const set = setQuoteCheck(created.value, quote.key, result);
  if (!set.ok) throw new Error("fixture quote check rejected");
  return set.value;
}

describe("mismatchAt _Requirements: 13.6_", () => {
  const doc = withResult({ status: "mismatch", prefixLength: 4 });
  const range = doc.quotes[0]?.quote;

  it("returns the record inside [start, end)", () => {
    if (range === undefined) throw new Error("no quote");
    expect(mismatchAt(doc, range.start)?.key).toBe(doc.quotes[0]?.key);
    expect(mismatchAt(doc, range.end - 1)?.key).toBe(doc.quotes[0]?.key);
  });

  it("returns null outside the range, including at end", () => {
    if (range === undefined) throw new Error("no quote");
    expect(mismatchAt(doc, range.start - 1)).toBeNull();
    expect(mismatchAt(doc, range.end)).toBeNull();
  });

  it("returns null for match and unchecked results", () => {
    const start = range?.start ?? 0;
    expect(mismatchAt(withResult({ status: "match" }), start)).toBeNull();
    const unchecked = createDocument(FIXTURE, ISO);
    if (!unchecked.ok) throw new Error("fixture document rejected");
    expect(mismatchAt(unchecked.value, start)).toBeNull();
  });
});
