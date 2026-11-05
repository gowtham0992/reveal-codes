import { describe, expect, it } from "vitest";
import {
  countBoundaries,
  isBoundaryAt,
  isInsideCitation,
  type CitationRange,
} from "../src/boundary";
import { segmentWith } from "../src/segment";
import type { Span } from "../src/types";

const T = "2024-01-01T00:00:00Z";
const all = (text: string): Span[] =>
  text.length === 0
    ? []
    : [{ start: 0, end: text.length, provenance: { origin: "HUM", timestamp: T } }];

const boundariesOf = (text: string, ranges: readonly CitationRange[] = []): number[] =>
  [...Array(text.length + 1).keys()].filter((b) => isBoundaryAt(text, b, ranges));

/** The text of each Sentence `segmentWith` returns, so ownership of whitespace is visible. */
const sentencesOf = (text: string, ranges: readonly CitationRange[] = []): string[] => {
  const result = segmentWith(text, all(text), ranges);
  if (!result.ok) throw new Error(`segmentWith failed: ${result.error.kind}`);
  return result.value.map((s) => text.slice(s.start, s.end));
};

describe("terminator sequences _Requirements: 8.3_", () => {
  it("places the boundary at the first non-whitespace unit after `.`, `?`, `!`", () => {
    expect(boundariesOf("One. Two?  Three!\nFour")).toEqual([5, 11, 18]);
  });

  it("accepts a run of several terminators", () => {
    expect(sentencesOf("Really?! Yes... Fine.")).toEqual(["Really?! ", "Yes... ", "Fine."]);
  });

  it.each(['"', "”", "'", "’", ")"])("accepts a trailing %s after the terminator", (closer) => {
    expect(sentencesOf(`He said no.${closer} Then left.`)).toEqual([
      `He said no.${closer} `,
      "Then left.",
    ]);
  });

  it("accepts several trailing closers in a row", () => {
    expect(sentencesOf("(He said “no.”) Then left.")).toEqual(["(He said “no.”) ", "Then left."]);
    expect(boundariesOf('He said "no." Then (yes.) Done’ x.’ End')).toEqual([14, 26, 36]);
  });

  it("places no boundary without whitespace after the sequence", () => {
    expect(boundariesOf("One.Two (a.)b “c.”d")).toEqual([]);
  });

  it("places no boundary when a closer is not preceded by a terminator", () => {
    expect(boundariesOf("He said “no” Then (yes) Done")).toEqual([]);
  });
});

describe("whitespace ownership _Requirements: 8.3_", () => {
  it("gives every whitespace unit between Sentences to the preceding Sentence", () => {
    expect(sentencesOf("One.  \n\tTwo. \u00a0Three")).toEqual([
      "One.  \n\t",
      "Two. \u00a0",
      "Three",
    ]);
  });

  it("keeps trailing whitespace in the last Sentence", () => {
    expect(sentencesOf("One. Two.  \n")).toEqual(["One. ", "Two.  \n"]);
  });

  it("finds no boundary at the end of the text or at 0", () => {
    expect(isBoundaryAt("A. ", 3, [])).toBe(false);
    expect(isBoundaryAt("A. B", 0, [])).toBe(false);
  });
});

describe("Legal_Abbreviation exclusion _Requirements: 8.6_", () => {
  it.each(["v.", "Inc.", "No.", "Ltd.", "Co.", "L.P.", "N.A.", "L.L.C."])(
    "places no boundary after %s",
    (abbr) => {
      const text = `Acme ${abbr} Then more`;
      expect(boundariesOf(text)).toEqual([]);
      expect(sentencesOf(text)).toEqual([text]);
    },
  );

  it("keeps `Acme Co. Then` as one Sentence", () => {
    expect(sentencesOf("Acme Co. Then")).toEqual(["Acme Co. Then"]);
  });

  it("still splits at ordinary periods around abbreviations", () => {
    expect(boundariesOf("Roe v. Wade. Acme Co. Then No. 5. Next")).toEqual([13, 34]);
  });

  it("accepts `(` before the abbreviation", () => {
    expect(boundariesOf("See (No. 5) here")).toEqual([]);
  });

  it("matches case-sensitively", () => {
    expect(sentencesOf("Acme co. Then")).toEqual(["Acme co. ", "Then"]);
    expect(sentencesOf("Acme NO. Then")).toEqual(["Acme NO. ", "Then"]);
  });

  it("requires start, whitespace, or `(` before the abbreviation", () => {
    expect(sentencesOf("Co. Then")).toEqual(["Co. Then"]);
    expect(sentencesOf("AcmeCo. Then")).toEqual(["AcmeCo. ", "Then"]);
    expect(sentencesOf("(Co. Then")).toEqual(["(Co. Then"]);
  });
});

describe("citation ranges _Requirements: 8.5_", () => {
  it("places no boundary strictly inside a hand-placed citation range", () => {
    const text = "See A. B. C.";
    expect(boundariesOf(text)).toEqual([7, 10]);
    expect(boundariesOf(text, [{ start: 4, end: 10 }])).toEqual([10]);
  });

  it("keeps a citation range inside one Sentence when segmenting", () => {
    const text = "See Foo. Bar. Baz, 1 X. 2. Then end.";
    const ranges = [{ start: 4, end: 25 }];
    expect(sentencesOf(text)).toEqual(["See Foo. ", "Bar. ", "Baz, 1 X. ", "2. ", "Then end."]);
    expect(sentencesOf(text, ranges)).toEqual(["See Foo. Bar. Baz, 1 X. 2. ", "Then end."]);
  });

  it("allows a boundary exactly at a range's start or end", () => {
    const text = "A. B. C";
    expect(boundariesOf(text, [{ start: 3, end: 6 }])).toEqual([3, 6]);
  });

  it("isInsideCitation is strict at both ends", () => {
    const ranges = [
      { start: 2, end: 5 },
      { start: 8, end: 12 },
    ];
    expect([2, 3, 4, 5, 8, 9, 11, 12].map((b) => isInsideCitation(b, ranges))).toEqual([
      false,
      true,
      true,
      false,
      false,
      true,
      true,
      false,
    ]);
  });
});

describe("countBoundaries _Requirements: 8.3_", () => {
  const text = "A1. B2. C3. D4.";

  it("counts boundaries in (from, to]", () => {
    expect(countBoundaries(text, 0, text.length, [], Infinity)).toBe(3);
    expect(countBoundaries(text, 4, 8, [], Infinity)).toBe(1);
    expect(countBoundaries(text, 3, 4, [], Infinity)).toBe(1);
    expect(countBoundaries(text, 4, 7, [], Infinity)).toBe(0);
  });

  it("stops at its cap", () => {
    expect(countBoundaries(text, 0, text.length, [], 1)).toBe(1);
    expect(countBoundaries(text, 0, text.length, [], 2)).toBe(2);
    expect(countBoundaries(text, 0, text.length, [], 3)).toBe(3);
    expect(countBoundaries(text, 0, text.length, [], 0)).toBe(0);
  });

  it("respects citation ranges and abbreviations", () => {
    expect(countBoundaries(text, 0, text.length, [{ start: 2, end: 10 }], Infinity)).toBe(1);
    expect(countBoundaries("Acme Co. Then x. Y", 0, 18, [], Infinity)).toBe(1);
  });
});

describe("text with no terminator _Requirements: 8.4_", () => {
  it("is one Sentence", () => {
    const text = "no terminator here, just words  ";
    expect(boundariesOf(text)).toEqual([]);
    expect(sentencesOf(text)).toEqual([text]);
  });

  it("is one Sentence when the only terminator ends the text", () => {
    expect(sentencesOf("Only one sentence.")).toEqual(["Only one sentence."]);
    expect(sentencesOf("Only one sentence.  ")).toEqual(["Only one sentence.  "]);
  });
});
