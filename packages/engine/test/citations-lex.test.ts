import { describe, expect, it } from "vitest";
import {
  DOC_NUMBER_RANGE,
  PAGE_RANGE,
  VOLUME_RANGE,
  YEAR_RANGE,
  isWordChar,
  isWordCharAt,
  isWordCharBefore,
  readInt,
  readLiteral,
  readSpaces,
  readWord,
} from "../src/citations/lex";

describe("readInt _Requirements: 10.1_", () => {
  it("reads a maximal digit run and returns its value and end", () => {
    expect(readInt("410 U.S. 113", 0, VOLUME_RANGE)).toEqual({ value: 410, end: 3 });
    expect(readInt("p 113,", 2, PAGE_RANGE)).toEqual({ value: 113, end: 5 });
  });

  it("rejects leading zeros, including a lone zero", () => {
    expect(readInt("0410", 0, VOLUME_RANGE)).toBeNull();
    expect(readInt("0", 0, VOLUME_RANGE)).toBeNull();
  });

  it("enforces range bounds at both ends", () => {
    expect(readInt("99999", 0, PAGE_RANGE)).toEqual({ value: 99_999, end: 5 });
    expect(readInt("100000", 0, PAGE_RANGE)).toBeNull();
    expect(readInt("1600", 0, YEAR_RANGE)).toEqual({ value: 1600, end: 4 });
    expect(readInt("1599", 0, YEAR_RANGE)).toBeNull();
    expect(readInt("3000", 0, YEAR_RANGE)).toBeNull();
    expect(readInt("9999999", 0, DOC_NUMBER_RANGE)).toEqual({ value: 9_999_999, end: 7 });
  });

  it("fails rather than taking a prefix of a too-long run", () => {
    const long = "1".repeat(1000);
    expect(readInt(long, 0, YEAR_RANGE)).toBeNull();
    expect(readInt("20241", 0, YEAR_RANGE)).toBeNull();
  });

  it("fails on a non-digit or an out-of-text start", () => {
    expect(readInt("U.S.", 0, VOLUME_RANGE)).toBeNull();
    expect(readInt("12", 2, VOLUME_RANGE)).toBeNull();
    expect(readInt("12", -1, VOLUME_RANGE)).toBeNull();
    expect(readInt("١٢", 0, VOLUME_RANGE)).toBeNull();
  });
});

describe("readSpaces, readLiteral, readWord", () => {
  it("reads exactly one space by default", () => {
    expect(readSpaces("a b", 1)).toBe(2);
    expect(readSpaces("a  b", 1)).toBeNull();
    expect(readSpaces("ab", 1)).toBeNull();
    expect(readSpaces("a\tb", 1)).toBeNull();
  });

  it("reads a bounded run of spaces", () => {
    expect(readSpaces("a   b", 1, 1, 3)).toBe(4);
    expect(readSpaces("a    b", 1, 1, 3)).toBeNull();
    expect(readSpaces("ab", 1, 0, 3)).toBe(1);
  });

  it("reads a literal exactly", () => {
    expect(readLiteral("5 U.S. at 9", 6, " at ")).toBe(10);
    expect(readLiteral("5 U.S. At 9", 6, " at ")).toBeNull();
    expect(readLiteral("abc", 0, "")).toBeNull();
  });

  it("reads a bounded word by code point", () => {
    expect(readWord("Roe v.", 0, 10)).toBe(3);
    expect(readWord("𝐀𝐁 x", 0, 4)).toBe(4);
    expect(readWord("𝐀𝐁 x", 0, 3)).toBeNull();
    expect(readWord(" x", 0, 10)).toBeNull();
  });
});

describe("word characters _Requirements: 9.8_", () => {
  it("classifies Unicode letters and numbers as word characters", () => {
    for (const ch of ["a", "Z", "é", "ß", "7", "٣", "Ж", "𝐀"]) expect(isWordChar(ch)).toBe(true);
    for (const ch of [" ", ".", ",", "(", "§", "'", "-", "", "ab"])
      expect(isWordChar(ch)).toBe(false);
  });

  it("checks the code point before and at an Offset", () => {
    expect(isWordCharBefore("x410", 1)).toBe(true);
    expect(isWordCharBefore(" 410", 1)).toBe(false);
    expect(isWordCharBefore("410", 0)).toBe(false);
    expect(isWordCharAt("113a", 3)).toBe(true);
    expect(isWordCharAt("113.", 3)).toBe(false);
    expect(isWordCharAt("113", 3)).toBe(false);
  });

  it("reads a Surrogate_Pair as one code point on either side", () => {
    const t = "𝐀410𝐀";
    expect(isWordCharBefore(t, 2)).toBe(true);
    expect(isWordCharAt(t, 5)).toBe(true);
    expect(isWordCharBefore("\ud835410", 1)).toBe(false);
  });
});
