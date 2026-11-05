import { describe, expect, it } from "vitest";
import { MAX_SECTION, matchOtherAt, readSection } from "../src/citations/grammar-other";

describe("matchOtherAt: U.S.C. and C.F.R. _Requirements: 9.6_", () => {
  it("matches 42 U.S.C. § 1983 with title and section", () => {
    const text = "Under 42 U.S.C. § 1983, a person may sue.";
    const p = text.indexOf("42");
    const m = matchOtherAt(text, p);
    expect(m).toEqual({
      start: p,
      end: p + "42 U.S.C. § 1983".length,
      value: { kind: "other", form: "usc", title: 42, section: "1983" },
    });
  });

  it("keeps letter suffixes inside the section", () => {
    expect(matchOtherAt("15 U.S.C. § 1681a", 0)?.value.section).toBe("1681a");
  });

  it("matches §§, hyphenated sections, and subdivisions", () => {
    expect(matchOtherAt("42 U.S.C. §§ 2000e-2(a)(1)", 0)?.value).toEqual({
      kind: "other",
      form: "usc",
      title: 42,
      section: "2000e-2(a)(1)",
    });
  });

  it("matches a C.F.R. section and leaves a sentence-final period out", () => {
    const text = "See 17 C.F.R. § 240.10b-5.";
    const m = matchOtherAt(text, 4);
    expect(m?.value).toEqual({ kind: "other", form: "cfr", title: 17, section: "240.10b-5" });
    expect(m && text.slice(m.start, m.end)).toBe("17 C.F.R. § 240.10b-5");
  });

  it("rejects malformed code references", () => {
    for (const bad of [
      "42 USC § 1983",
      "42 U.S.C. §1983",
      "42 U.S.C.A. § 1983",
      "42  U.S.C. § 1983",
      "042 U.S.C. § 1983",
      "42 U.S.C. § 0983",
      "42 U.S.C. § 1983é",
      "42 U.S.C. §",
    ]) {
      expect(matchOtherAt(bad, 0), bad).toBeNull();
    }
  });

  it("rejects a title preceded by a letter or digit (Req 9.8)", () => {
    expect(matchOtherAt("x42 U.S.C. § 1983", 1)).toBeNull();
    expect(matchOtherAt("142 U.S.C. § 1983", 1)).toBeNull();
  });
});

describe("matchOtherAt: Federal Rules _Requirements: 9.6_", () => {
  it("matches each rule set, with Evid. taking no P.", () => {
    const cases: readonly [string, string][] = [
      ["Fed. R. Civ. P. 11", "11"],
      ["Fed. R. Civ. P. 12(b)(6)", "12(b)(6)"],
      ["Fed. R. Crim. P. 5.1", "5.1"],
      ["Fed. R. App. P. 4(a)", "4(a)"],
      ["Fed. R. Bankr. P. 9011", "9011"],
      ["Fed. R. Evid. 801(d)(2)(E)", "801(d)(2)(E)"],
    ];
    for (const [text, section] of cases) {
      expect(matchOtherAt(text, 0), text).toEqual({
        start: 0,
        end: text.length,
        value: { kind: "other", form: "fed_rule", section },
      });
    }
  });

  it("rejects other rule forms and a glued prefix", () => {
    for (const bad of [
      "Fed. R. Evid. P. 403",
      "Fed. R. Civ. 11",
      "Fed R. Civ. P. 11",
      "Fed. R. Civ. P. ",
    ]) {
      expect(matchOtherAt(bad, 0), bad).toBeNull();
    }
    expect(matchOtherAt("xFed. R. Civ. P. 11", 1)).toBeNull();
  });
});

describe("readSection bounds and totality _Requirements: 9.6_", () => {
  it("rejects a designator longer than MAX_SECTION rather than taking a prefix", () => {
    expect(readSection("1".repeat(MAX_SECTION), 0)).toBe(MAX_SECTION);
    expect(readSection("1".repeat(MAX_SECTION + 1), 0)).toBeNull();
    expect(readSection(`1${"(a)".repeat(14)}`, 0)).toBeNull();
  });

  it("stops at an unclosed or empty subdivision", () => {
    expect(readSection("1983(a", 0)).toBe(4);
    expect(readSection("1983()", 0)).toBe(4);
  });

  it("returns null at out-of-range positions and on lone surrogates", () => {
    expect(matchOtherAt("", 0)).toBeNull();
    expect(matchOtherAt("42 U.S.C. § 1983", -1)).toBeNull();
    expect(matchOtherAt("42 U.S.C. § 1983", 99)).toBeNull();
    expect(matchOtherAt("\uD800Fed. R. Civ. P. 11\uDC00", 1)?.end).toBe(19);
  });
});
