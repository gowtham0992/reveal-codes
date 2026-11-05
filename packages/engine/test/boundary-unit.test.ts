import { describe, expect, it } from "vitest";
import { countBoundaries, isBoundaryAt, isInsideCitation } from "../src/boundary";

const boundariesOf = (text: string, ranges: readonly { start: number; end: number }[] = []) =>
  [...Array(text.length + 1).keys()].filter((b) => isBoundaryAt(text, b, ranges));

describe("isBoundaryAt _Requirements: 8.3, 8.5, 8.6, 8.8_", () => {
  it("places the boundary at the first non-whitespace unit after a terminator", () => {
    expect(boundariesOf("One. Two?  Three!\nFour")).toEqual([5, 11, 18]);
  });

  it("accepts closing quotes and parentheses after the terminator", () => {
    expect(boundariesOf('He said "no." Then (yes.) Done’ x.’ End')).toEqual([14, 26, 36]);
  });

  it("places no boundary after a Legal_Abbreviation", () => {
    expect(boundariesOf("Roe v. Wade. Acme Co. Then No. 5. Next")).toEqual([13, 34]);
  });

  it("places no boundary strictly inside a citation range", () => {
    const text = "See A. B. C.";
    expect(boundariesOf(text)).toEqual([7, 10]);
    expect(boundariesOf(text, [{ start: 4, end: 10 }])).toEqual([10]);
  });

  it("finds nothing without a terminator or at the ends", () => {
    expect(boundariesOf("no terminator here")).toEqual([]);
    expect(isBoundaryAt("A. ", 3, [])).toBe(false);
    expect(isBoundaryAt("A. B", 0, [])).toBe(false);
  });
});

describe("isInsideCitation _Requirements: 8.5_", () => {
  it("is strict at both ends", () => {
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
  });

  it("stops at the cap", () => {
    expect(countBoundaries(text, 0, text.length, [], 2)).toBe(2);
    expect(countBoundaries(text, 0, text.length, [], 0)).toBe(0);
  });
});
