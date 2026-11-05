import { describe, expect, it } from "vitest";
import {
  BASE_ABBREVIATION_INDEX,
  ENTITY_SUFFIX_WORDS,
  LEGAL_ABBREVIATIONS,
  abbreviationsStartingAt,
  buildAbbreviationIndex,
  buildFirstUnitIndex,
  buildLengthIndex,
  isAbbreviationEndingAt,
} from "../src/abbreviations";

const endOf = (text: string, needle: string): number => text.indexOf(needle) + needle.length - 1;

describe("abbreviation lists _Requirements: 8.6, 9.2, 12.2_", () => {
  it("lists the non-reporter Legal_Abbreviations in Glossary order", () => {
    expect(LEGAL_ABBREVIATIONS).toEqual([
      "Id.",
      "v.",
      "Inc.",
      "Corp.",
      "Ltd.",
      "Co.",
      "L.P.",
      "N.A.",
      "L.L.C.",
      "No.",
      "Cir.",
      "Dist.",
      "Ct.",
      "Fed.",
      "Supp.",
      "et al.",
    ]);
  });

  it("makes every Entity_Suffix word except LLC a Legal_Abbreviation", () => {
    expect(ENTITY_SUFFIX_WORDS).toEqual([
      "Inc.",
      "LLC",
      "L.L.C.",
      "Ltd.",
      "Co.",
      "Corp.",
      "L.P.",
      "N.A.",
    ]);
    const notAbbr = ENTITY_SUFFIX_WORDS.filter((w) => !LEGAL_ABBREVIATIONS.includes(w));
    expect(notAbbr).toEqual(["LLC"]);
  });
});

describe("index builders _Requirements: 8.6_", () => {
  it("indexes the base list by length and by first code unit", () => {
    expect([...(buildLengthIndex([]).get(3) ?? [])].sort()).toEqual(["Co.", "Ct.", "Id.", "No."]);
    expect(buildFirstUnitIndex([]).get("L")).toEqual(["Ltd.", "L.P.", "L.L.C."]);
    expect(BASE_ABBREVIATION_INDEX.longest).toBe("et al.".length);
  });

  it("adds extra reporter abbreviations without duplicating entries", () => {
    const index = buildAbbreviationIndex(["U.S.", "F. Supp. 2d.", "Fed."]);
    expect(index.byLength.get(4)?.has("U.S.")).toBe(true);
    expect(index.byFirstUnit.get("F")).toEqual(["Fed.", "F. Supp. 2d."]);
    expect(index.longest).toBe("F. Supp. 2d.".length);
  });
});

describe("isAbbreviationEndingAt _Requirements: 8.6, 13.1_", () => {
  it("holds at the final period of every listed abbreviation after a space", () => {
    for (const a of LEGAL_ABBREVIATIONS) {
      const text = `See ${a} Then`;
      expect(isAbbreviationEndingAt(text, endOf(text, a))).toBe(true);
    }
  });

  it("covers the new entity abbreviations, as in `Acme Co. Then`", () => {
    for (const a of ["Ltd.", "Co.", "L.P.", "N.A.", "L.L.C."]) {
      const text = `Acme ${a} Then`;
      expect(isAbbreviationEndingAt(text, endOf(text, a))).toBe(true);
    }
  });

  it("accepts the start of the Text, whitespace, or `(` before the abbreviation", () => {
    expect(isAbbreviationEndingAt("Id. at 5", 2)).toBe(true);
    expect(isAbbreviationEndingAt("x\tNo. 4", 4)).toBe(true);
    expect(isAbbreviationEndingAt("(Cir. 2010)", 4)).toBe(true);
  });

  it("rejects other preceding code units, wrong case, and non-periods", () => {
    expect(isAbbreviationEndingAt("Taco. Then", 4)).toBe(false);
    expect(isAbbreviationEndingAt("[Id. at 5]", 3)).toBe(false);
    expect(isAbbreviationEndingAt("co. Then", 2)).toBe(false);
    expect(isAbbreviationEndingAt("He left. Then", 7)).toBe(false);
    expect(isAbbreviationEndingAt("Inc! Then", 3)).toBe(false);
    expect(isAbbreviationEndingAt("Id.", 3)).toBe(false);
    expect(isAbbreviationEndingAt("Id.", -1)).toBe(false);
  });

  it("matches a reporter abbreviation only when the index includes it", () => {
    const text = "in U.S. Then";
    expect(isAbbreviationEndingAt(text, 6)).toBe(false);
    expect(isAbbreviationEndingAt(text, 6, buildAbbreviationIndex(["U.S."]))).toBe(true);
  });
});

describe("abbreviationsStartingAt _Requirements: 9.2, 12.2_", () => {
  it("returns the end of each occurrence starting at the offset", () => {
    const text = "Acme, L.L.C. v. Smith";
    expect(abbreviationsStartingAt(text, 6, text.length)).toEqual([12]);
    expect(abbreviationsStartingAt(text, 13, text.length)).toEqual([15]);
    expect(abbreviationsStartingAt(text, 0, text.length)).toEqual([]);
  });

  it("returns every nested occurrence in ascending order", () => {
    const index = buildAbbreviationIndex(["L."]);
    expect(abbreviationsStartingAt("L.L.C.", 0, 6, index)).toEqual([2, 6]);
  });

  it("respects the limit and the bounds of the Text", () => {
    expect(abbreviationsStartingAt("N.A. bank", 0, 3)).toEqual([]);
    expect(abbreviationsStartingAt("N.A. bank", 0, 4)).toEqual([4]);
    expect(abbreviationsStartingAt("N.A.", 0, 99)).toEqual([4]);
    expect(abbreviationsStartingAt("N.A.", 4, 99)).toEqual([]);
  });

  it("finds reporter abbreviations through an extended index", () => {
    const index = buildAbbreviationIndex(["U.S."]);
    expect(abbreviationsStartingAt("5 U.S. 9", 2, 8)).toEqual([]);
    expect(abbreviationsStartingAt("5 U.S. 9", 2, 8, index)).toEqual([6]);
  });
});
