import { describe, expect, it } from "vitest";
import {
  collapseWhitespace,
  foldCase,
  foldEllipses,
  normalise,
  normaliseQuote,
  removeBracketPairs,
  straightenDashes,
  straightenQuotes,
  trimTail,
} from "../src/normalise";

describe("normalise steps _Requirements: 8.2, 8.3, 8.4_", () => {
  it("step 1 composes NFC", () => {
    expect(normalise("e\u0301")).toBe("\u00e9");
  });

  it("step 2 straightens curly quotes", () => {
    expect(straightenQuotes("“a” ‘b’ ‚c")).toBe("\"a\" 'b' 'c");
  });

  it("step 3 turns en and em dashes into hyphens", () => {
    expect(straightenDashes("a–b—c")).toBe("a-b-c");
  });

  it("step 4 removes matched brackets and keeps unmatched ones", () => {
    expect(removeBracketPairs("[t]he")).toBe("the");
    expect(removeBracketPairs("[[a]b]")).toBe("ab");
    expect(removeBracketPairs("]a[")).toBe("]a[");
    expect(removeBracketPairs("[a")).toBe("[a");
  });

  it("step 5 folds every ellipsis form", () => {
    expect(foldEllipses("a...b")).toBe("a…b");
    expect(foldEllipses("a. . .b")).toBe("a…b");
    expect(foldEllipses("a.\u00a0.\u0085.b")).toBe("a…b");
    expect(foldEllipses("a....b")).toBe("a…b");
    expect(foldEllipses("a..b")).toBe("a..b");
  });

  it("step 6 collapses White_Space including U+0085 and trims, but not U+FEFF", () => {
    expect(collapseWhitespace("  a \t\n\u00a0\u0085b  ")).toBe("a b");
    expect(collapseWhitespace("\ufeffa")).toBe("\ufeffa");
  });

  it("brackets are removed before ellipsis folding", () => {
    expect(normalise("a[...]b")).toBe("a…b");
    expect(normalise("a.[.].b")).toBe("a…b");
  });

  it("handles runs of spaced dots with NBSP and U+0085", () => {
    expect(normalise("x .\u00a0.\u0085. y")).toBe("x … y");
  });

  it("handles curly quotes and dashes end to end, and folds case", () => {
    expect(normalise("“Hello” — World")).toBe('"hello" - world');
  });

  it("foldCase leaves units whose lower case is not one unit", () => {
    expect(foldCase("A\u0130")).toBe("a\u0130");
  });
});

describe("normaliseQuote _Requirements: 8.3_", () => {
  it("trims trailing punctuation together with whitespace before it", () => {
    expect(normaliseQuote("the court held . , ; :")).toBe("the court held");
    expect(normaliseQuote("held ;  .  ")).toBe("held");
  });

  it("keeps interior punctuation", () => {
    expect(normaliseQuote("a, b. c")).toBe("a, b. c");
  });

  it("trimTail stops at other characters", () => {
    expect(trimTail("abc!.")).toBe("abc!");
  });

  it("empty and whitespace-only input give the empty string", () => {
    expect(normalise("")).toBe("");
    expect(normalise(" \t\u00a0\n")).toBe("");
    expect(normaliseQuote("")).toBe("");
    expect(normaliseQuote(" \u0085 ")).toBe("");
  });

  it("keeps a trailing ellipsis (it is not tail punctuation)", () => {
    expect(normaliseQuote("held that...")).toBe("held that…");
  });
});
