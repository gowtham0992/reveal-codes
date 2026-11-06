import { describe, expect, it } from "vitest";
import {
  LEXIS_COURTS,
  isUnlistedLexisCourt,
  lexisCollapsedIndex,
  lexisExactIndex,
  lookupLexisCourt,
} from "../src/citations/lexis-courts";
import { collapseReporter } from "../src/citations/reporters";

describe("Lexis_Court_List _Requirements: 14.8_", () => {
  it("holds the 194 committed courts, none ending in LEXIS", () => {
    expect(LEXIS_COURTS).toHaveLength(194);
    expect(LEXIS_COURTS.filter((c) => c.split(" ").includes("LEXIS"))).toEqual([]);
  });

  it("indexes every key at its first entry", () => {
    LEXIS_COURTS.forEach((c, i) => {
      expect(LEXIS_COURTS.indexOf(c)).toBe(lexisExactIndex.get(c));
      const first = LEXIS_COURTS.findIndex((e) => collapseReporter(e) === collapseReporter(c));
      expect(lexisCollapsedIndex.get(collapseReporter(c))).toBe(first);
      expect(first).toBeLessThanOrEqual(i);
    });
  });
});

describe("lookupLexisCourt _Requirements: 9.4_", () => {
  it("returns an exact entry, then the first collapsed match", () => {
    expect(lookupLexisCourt("U.S. Dist.")).toBe("U.S. Dist.");
    expect(lookupLexisCourt("US Dist.")).toBe("U.S. Dist.");
    expect(lookupLexisCourt("U.S.Dist")).toBe("U.S. Dist.");
  });

  it("is case-sensitive and returns null for other courts", () => {
    expect(lookupLexisCourt("u.s. dist.")).toBeNull();
    expect(lookupLexisCourt("Foo Cty. Ct.")).toBeNull();
    expect(lookupLexisCourt("")).toBeNull();
  });
});

describe("isUnlistedLexisCourt _Requirements: 9.4, 10.1_", () => {
  it("accepts the Glossary example", () => {
    expect(isUnlistedLexisCourt("Foo Cty. Ct.")).toBe(true);
    expect(isUnlistedLexisCourt("N.Y. 2d Sup.")).toBe(true);
    expect(isUnlistedLexisCourt("A".repeat(40))).toBe(true);
  });

  it("rejects the Glossary non-examples", () => {
    expect(isUnlistedLexisCourt("and the court in 2023 U.S. Dist.")).toBe(false);
    expect(isUnlistedLexisCourt("Union, 2023 U.S. Dist.")).toBe(false);
  });

  it("rejects courts that match a list entry, exactly or collapsed", () => {
    expect(isUnlistedLexisCourt("U.S. Dist.")).toBe(false);
    expect(isUnlistedLexisCourt("US Dist.")).toBe(false);
  });

  it("rejects each broken shape rule", () => {
    for (const c of [
      "",
      "A".repeat(41),
      "Foo  Ct.",
      " Foo",
      "Foo ",
      "foo Ct.",
      ".Foo",
      "Foo 1999",
      "Foo,",
      "Foo\tCt.",
      "Foo (Ct.)",
      'Foo "Ct."',
      "Foo “Ct.”",
      "Foo LEXIS",
      "WL Foo",
    ]) {
      expect(isUnlistedLexisCourt(c), c).toBe(false);
    }
    expect(isUnlistedLexisCourt("Foo 3000 Ct.")).toBe(true);
    expect(isUnlistedLexisCourt("Foo WL")).toBe(true);
  });
});
