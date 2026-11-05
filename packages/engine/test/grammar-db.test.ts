import { describe, expect, it } from "vitest";
import { isCourt, matchDatabaseAt } from "../src/citations/grammar-db";

const slice = (text: string, p: number): string | null => {
  const m = matchDatabaseAt(text, p);
  return m === null ? null : text.slice(m.start, m.end);
};

describe("matchDatabaseAt WL form _Requirements: 9.4_", () => {
  it("reads year, WL, and document number", () => {
    expect(matchDatabaseAt("2024 WL 123456", 0)).toEqual({
      start: 0,
      end: 14,
      value: { kind: "database", year: 2024, designator: "WL", number: 123456 },
    });
  });

  it("reads an optional `, at *<pincite>`", () => {
    const text = "See 2024 WL 123456, at *3.";
    expect(matchDatabaseAt(text, 4)).toEqual({
      start: 4,
      end: 25,
      value: { kind: "database", year: 2024, designator: "WL", number: 123456, pincite: 3 },
    });
  });

  it("keeps a parenthetical in the range but not in the value", () => {
    const text = "2024 WL 123456, at *3 (S.D.N.Y. Jan. 5, 2024) next";
    const m = matchDatabaseAt(text, 0);
    expect(m?.end).toBe(text.indexOf(" next"));
    expect(m?.value).toEqual({
      kind: "database",
      year: 2024,
      designator: "WL",
      number: 123456,
      pincite: 3,
    });
    expect(slice("2024 WL 1 (2d Cir.)", 0)).toBe("2024 WL 1 (2d Cir.)");
    expect(slice("2024 WL 1 (2024)", 0)).toBe("2024 WL 1 (2024)");
  });
});

describe("matchDatabaseAt LEXIS form _Requirements: 9.4_", () => {
  it("reads the court tokens before LEXIS", () => {
    expect(matchDatabaseAt("2023 U.S. Dist. LEXIS 98765", 0)).toEqual({
      start: 0,
      end: 27,
      value: {
        kind: "database",
        year: 2023,
        designator: "LEXIS",
        lexisCourt: "U.S. Dist.",
        number: 98765,
      },
    });
  });

  it("reads an optional `, at *<pincite>`", () => {
    const m = matchDatabaseAt("2023 U.S. App. LEXIS 7, at *12", 0);
    expect(m?.end).toBe(30);
    expect(m?.value).toEqual({
      kind: "database",
      year: 2023,
      designator: "LEXIS",
      lexisCourt: "U.S. App.",
      number: 7,
      pincite: 12,
    });
  });

  it("rejects a missing, over-long, or year-final court", () => {
    expect(matchDatabaseAt("2023 LEXIS 98765", 0)).toBeNull();
    expect(matchDatabaseAt(`2023 ${"A".repeat(41)} LEXIS 5`, 0)).toBeNull();
    expect(matchDatabaseAt(`2023 ${"A".repeat(40)} LEXIS 5`, 0)).not.toBeNull();
    expect(matchDatabaseAt("2023 Dist. 1999 LEXIS 5", 0)).toBeNull();
    expect(matchDatabaseAt("2023 U.S.  Dist. LEXIS 5", 0)).toBeNull();
    expect(matchDatabaseAt("2023 (Dist.) LEXIS 5", 0)).toBeNull();
  });
});

describe("matchDatabaseAt rejects _Requirements: 9.4, 9.8, 10.1_", () => {
  it("rejects bad numbers and spacing", () => {
    expect(matchDatabaseAt("0224 WL 123456", 0)).toBeNull();
    expect(matchDatabaseAt("1599 WL 123456", 0)).toBeNull();
    expect(matchDatabaseAt("2024 WL 0123", 0)).toBeNull();
    expect(matchDatabaseAt("2024 WL 10000000", 0)).toBeNull();
    expect(matchDatabaseAt("2024  WL 123456", 0)).toBeNull();
    expect(matchDatabaseAt("2024 WL  123456", 0)).toBeNull();
    expect(matchDatabaseAt("2024 wl 123456", 0)).toBeNull();
  });

  it("enforces word boundaries on both sides", () => {
    expect(matchDatabaseAt("x2024 WL 123456", 1)).toBeNull();
    expect(matchDatabaseAt("12024 WL 123456", 1)).toBeNull();
    expect(matchDatabaseAt("2024 WL 123456a", 0)).toBeNull();
    expect(matchDatabaseAt("(2024 WL 123456)", 1)?.end).toBe(15);
  });

  it("ends at the number when the pincite or parenthetical does not parse", () => {
    expect(slice("2024 WL 123456, at *0", 0)).toBe("2024 WL 123456");
    expect(slice("2024 WL 123456, at *3a", 0)).toBe("2024 WL 123456");
    expect(slice("2024 WL 123456, at 3", 0)).toBe("2024 WL 123456");
    expect(slice('2024 WL 1 ("x")', 0)).toBe("2024 WL 1");
    expect(slice("2024 WL 1 (a 1999 2000)", 0)).toBe("2024 WL 1");
    expect(slice(`2024 WL 1 (${"A".repeat(50)})`, 0)).toBe("2024 WL 1");
  });

  it("returns null without throwing on edge inputs", () => {
    expect(matchDatabaseAt("", 0)).toBeNull();
    expect(matchDatabaseAt("2024 WL 1", -1)).toBeNull();
    expect(matchDatabaseAt("2024 WL 1", 99)).toBeNull();
    expect(matchDatabaseAt("2024 WL \uD800", 0)).toBeNull();
    expect(matchDatabaseAt("2024 \uDC00 LEXIS 5", 0)?.value).toMatchObject({
      lexisCourt: "\uDC00",
    });
  });
});

describe("isCourt _Requirements: 10.1_", () => {
  it("applies the tightened court rule", () => {
    expect(isCourt("U.S. Dist.")).toBe(true);
    expect(isCourt("S.D.N.Y. Jan. 5,")).toBe(true);
    expect(isCourt("")).toBe(false);
    expect(isCourt("1999")).toBe(false);
    expect(isCourt("x 2001")).toBe(false);
    expect(isCourt("a  b")).toBe(false);
    expect(isCourt(" a")).toBe(false);
    expect(isCourt('a"b')).toBe(false);
    expect(isCourt("A".repeat(41))).toBe(false);
  });
});
