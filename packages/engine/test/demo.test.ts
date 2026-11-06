import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extract } from "../src/citations/extract";

/**
 * The demo motion (fixtures/demo-motion.txt). Every Offset below was counted
 * from the fixture text, not produced by `extract`; each is cross-checked
 * against `text.slice` so a fixture edit fails loudly here.
 */
const text = readFileSync(new URL("../fixtures/demo-motion.txt", import.meta.url), "utf8");

const at = (start: number, end: number) => ({ start, end, text: text.slice(start, end) });

const FABRICATED_CITATIONS = [
  { start: 1466, written: "1047 F.3d 212, 219 (9th Cir. 2019)" },
  { start: 1696, written: "1012 F. Supp. 2d 88, 95 (D. Or. 2015)" },
  { start: 2004, written: "912 F. 4th 33, 41 (9th Cir. 2023)" },
];

const FABRICATED_QUOTE = {
  start: 2117,
  written:
    "a pro se plaintiff who alleges retaliation is entitled to discovery before a motion to dismiss may be granted.",
};

const EXPECTED_CITATIONS = [
  { ...at(337, 361), value: { kind: "other", form: "fed_rule", section: "12(b)(6)" } },
  { ...at(779, 795), value: { kind: "other", form: "usc", title: 42, section: "3617" } },
  {
    ...at(954, 978),
    value: { kind: "reporter", volume: 556, reporter: "U.S.", page: 662, pincite: 678, year: 2009 },
  },
  {
    ...at(1062, 1086),
    value: { kind: "reporter", volume: 404, reporter: "U.S.", page: 519, pincite: 520, year: 1972 },
  },
  {
    ...at(1466, 1500),
    value: {
      kind: "reporter",
      volume: 1047,
      reporter: "F.3d",
      page: 212,
      pincite: 219,
      court: "9th Cir.",
      year: 2019,
    },
  },
  { ...at(1573, 1583), value: { kind: "short", form: "id", pincite: 221, targetStart: 1466 } },
  {
    ...at(1696, 1733),
    value: {
      kind: "reporter",
      volume: 1012,
      reporter: "F. Supp. 2d",
      page: 88,
      pincite: 95,
      court: "D. Or.",
      year: 2015,
    },
  },
  {
    ...at(2004, 2037),
    value: {
      kind: "reporter",
      volume: 912,
      reporter: "F.4th",
      page: 33,
      pincite: 41,
      court: "9th Cir.",
      year: 2023,
    },
    normalised: "912 F.4th 33, 41 (9th Cir. 2023)",
  },
  {
    ...at(2229, 2251),
    value: {
      kind: "short",
      form: "party",
      party: "Iqbal",
      volume: 556,
      reporter: "U.S.",
      pincite: 679,
      targetStart: 954,
    },
  },
  { ...at(2342, 2366), value: { kind: "other", form: "fed_rule", section: "15(a)(2)" } },
];

const EXPECTED_QUOTES = [
  { ...at(1089, 1154), citationStart: 1062, rule: "following" },
  { ...at(2117, 2227), citationStart: 2229, rule: "preceding" },
];

describe("demo motion fixture _Requirements: 9.1, 9.2, 13.1_", () => {
  it("has the planted items at the counted Offsets", () => {
    for (const c of FABRICATED_CITATIONS) {
      expect(text.slice(c.start, c.start + c.written.length)).toBe(c.written);
    }
    const q = FABRICATED_QUOTE;
    expect(text.slice(q.start, q.start + q.written.length)).toBe(q.written);
    expect(text.slice(1089, 1154)).toBe(
      "less stringent standards than formal pleadings drafted by lawyers",
    );
    expect(text.slice(1573, 1583)).toBe("Id. at 221");
    expect(text.slice(2229, 2251)).toBe("Iqbal, 556 U.S. at 679");
  });

  it("extracts exactly the expected citations, links, and Normalised_Forms", () => {
    expect(extract(text).citations).toEqual(EXPECTED_CITATIONS);
  });

  it("extracts each fabricated citation whole, at its Offsets", () => {
    const byStart = new Map(extract(text).citations.map((c) => [c.start, c]));
    for (const c of FABRICATED_CITATIONS) {
      expect(byStart.get(c.start)?.end).toBe(c.start + c.written.length);
    }
  });

  it("attaches the fabricated quote to the Iqbal Short_Form and the real quote to Haines", () => {
    expect(extract(text).quotes).toEqual(EXPECTED_QUOTES);
  });
});
