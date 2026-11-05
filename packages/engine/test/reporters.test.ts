import { describe, expect, it } from "vitest";
import { BASE_ABBREVIATION_INDEX, isAbbreviationEndingAt } from "../src/abbreviations";
import { isBoundaryAt } from "../src/boundary";
import {
  LEGAL_ABBREVIATION_INDEX,
  REPORTERS,
  REPORTER_ABBREVIATIONS,
  collapseReporter,
  collapsedIndex,
  exactIndex,
  lookupReporter,
} from "../src/citations/reporters";
import reporters from "../src/citations/reporters.json" with { type: "json" };

describe("REPORTERS _Requirements: 14.1_", () => {
  it("is the vendored list, in file order", () => {
    expect(REPORTERS).toEqual(reporters);
    expect(REPORTERS.length).toBe(932);
  });

  it("indexes every entry exactly at its own position", () => {
    expect(exactIndex.size).toBe(REPORTERS.length);
    REPORTERS.forEach((r, i) => {
      expect(exactIndex.get(r)).toBe(i);
    });
  });
});

describe("lookupReporter exact match _Requirements: 14.3, 14.5_", () => {
  it("returns the entry spelled as listed", () => {
    expect(lookupReporter("U.S.")).toBe("U.S.");
    expect(lookupReporter("F.3d")).toBe("F.3d");
    expect(lookupReporter("Cal. App. 4th")).toBe("Cal. App. 4th");
  });

  it("prefers an exact entry over an earlier entry with the same collapsed key", () => {
    // `N.D.` precedes `ND` in reporters.json, and both collapse to `ND`.
    expect(REPORTERS.indexOf("N.D.")).toBeLessThan(REPORTERS.indexOf("ND"));
    expect(lookupReporter("ND")).toBe("ND");
    expect(lookupReporter("N.D.")).toBe("N.D.");
  });
});

describe("lookupReporter collapsed match _Requirements: 11.1, 14.3_", () => {
  it("resolves near misses that remove or add periods and spaces", () => {
    expect(lookupReporter("US")).toBe("U.S.");
    expect(lookupReporter("U. S.")).toBe("U.S.");
    expect(lookupReporter("F3d")).toBe("F.3d");
    expect(lookupReporter("Cal.App.4th")).toBe("Cal. App. 4th");
  });

  it("is case-sensitive and rejects garbage", () => {
    expect(lookupReporter("u.s.")).toBeNull();
    expect(lookupReporter("Q.Z.")).toBeNull();
    expect(lookupReporter("")).toBeNull();
    expect(lookupReporter(". .")).toBeNull();
  });

  it("collapses by removing every period and ASCII space", () => {
    expect(collapseReporter("A.L.R. Fed. 2d")).toBe("ALRFed2d");
  });
});

describe("first entry wins on collapsed collisions _Requirements: 11.5, 14.6_", () => {
  it("picks the earliest entry in reporters.json order", () => {
    expect(lookupReporter("N. D.")).toBe("N.D.");
    expect(lookupReporter("M. S. P. B.")).toBe("M.S.P.B.");
    expect(lookupReporter("S D")).toBe("S.D.");
    expect(lookupReporter("D a y")).toBe("Day");
  });

  it("maps every collapsed key to the first entry that produces it", () => {
    collapsedIndex.forEach((at, key) => {
      expect(REPORTERS.findIndex((r) => collapseReporter(r) === key)).toBe(at);
    });
  });

  it("gives the same answer on repeated lookups", () => {
    expect(lookupReporter("N D")).toBe(lookupReporter("N D"));
  });
});

describe("reporter abbreviations in the Legal_Abbreviation index _Requirements: 8.6_", () => {
  it("passes exactly the entries ending in a period", () => {
    expect(REPORTER_ABBREVIATIONS).toEqual(REPORTERS.filter((r) => r.endsWith(".")));
    expect(REPORTER_ABBREVIATIONS).toContain("U.S.");
    expect(REPORTER_ABBREVIATIONS).not.toContain("F.3d");
  });

  it("extends the base index with reporter abbreviations", () => {
    const text = "in U.S. Then";
    expect(isAbbreviationEndingAt(text, 6, BASE_ABBREVIATION_INDEX)).toBe(false);
    expect(isAbbreviationEndingAt(text, 6, LEGAL_ABBREVIATION_INDEX)).toBe(true);
    expect(isAbbreviationEndingAt("Id. at 5", 2, LEGAL_ABBREVIATION_INDEX)).toBe(true);
  });

  it("stops the Segmenter's boundary predicate after a reporter abbreviation", () => {
    const text = "Decided in So. Then it ended. Next";
    expect(isBoundaryAt(text, text.indexOf("Then"), [])).toBe(false);
    expect(isBoundaryAt(text, text.indexOf("Next"), [])).toBe(true);
  });
});
