import { describe, expect, it } from "vitest";
import { attachQuotes, pairQuoteMarks } from "../src/citations/quotes";
import { scanRange } from "../src/citations/scan";

const never = (): boolean => false;

/** Quotes of `text`, with the citation list built by a full scan. */
const quotes = (text: string) =>
  attachQuotes(text, pairQuoteMarks(text), scanRange(text, 0, never));

/** The single quote's attached citation start and rule, or null when none attaches. */
const attached = (text: string): Readonly<{ at: number; rule: string }> | null => {
  const qs = quotes(text);
  expect(qs.length).toBeLessThanOrEqual(1);
  const q = qs[0];
  return q === undefined ? null : { at: q.citationStart, rule: q.rule };
};

const pre = (text: string, cite: string) => ({ at: text.indexOf(cite), rule: "preceding" });
const fol = (text: string, cite: string) => ({ at: text.indexOf(cite), rule: "following" });

describe("pairQuoteMarks _Requirements: 13.1, 13.2, 13.6_", () => {
  it("pairs straight marks left to right and drops empty or blank pairs", () => {
    expect(pairQuoteMarks('a "b" "" "  " "c')).toEqual([{ open: 2, close: 4 }]);
  });

  it("pairs each curly opener with the next closer before the next opener", () => {
    expect(pairQuoteMarks("“a “b” c”")).toEqual([{ open: 3, close: 5 }]);
  });

  it("never pairs a curly mark with a straight one", () => {
    expect(pairQuoteMarks('“mixed"')).toEqual([]);
    expect(pairQuoteMarks('"mixed”')).toEqual([]);
    expect(quotes('“right" Roe v. Wade, 410 U.S. 113')).toEqual([]);
  });

  it("drops a curly pair that lies inside a straight pair (13.10)", () => {
    expect(pairQuoteMarks('"He wrote “no” today."')).toEqual([{ open: 0, close: 21 }]);
    expect(pairQuoteMarks('“a "b" c”')).toEqual([{ open: 0, close: 8 }]);
  });

  it("returns the quoted text without its marks", () => {
    const t = '"right" 410 U.S. 113';
    expect(quotes(t)).toEqual([
      { start: 1, end: 6, text: "right", citationStart: 8, rule: "preceding" },
    ]);
  });
});

describe("attachQuotes preceding rule _Requirements: 13.1, 13.5, 13.7, 13.9_", () => {
  it.each([
    ['"a right ." Roe, 410 U.S. at 153.', "Roe,"],
    ['"a right," Roe v. Wade, 410 U.S. 113 (1973)', "410"],
    ['"a right" See Roe v. Wade, 410 U.S. 113', "410"],
    ['"a right." See Roe v. Wade, 410 U.S. 113', "410"],
    ['"a right" See Planned Parenthood, 505 U.S. at 833', "Planned"],
    ['"a right" (quoting Roe v. Wade, 410 U.S. 113)', "410"],
    ['"a right" See, e.g., Roe v. Wade, 410 U.S. 113', "410"],
    ['"a right" Cf. Roe v. Wade, 410 U.S. 113', "410"],
    ['"a right." Compare Roe v. Wade, 410 U.S. 113, with Casey, 505 U.S. at 833', "410"],
    ['"a right" United States v. John Q. Public, 5 U.S. 1', "5 U.S."],
  ])("attaches %s", (text, cite) => {
    expect(attached(text)).toEqual(pre(text, cite));
  });

  it.each([
    '"a right" In Casey, 505 U.S. at 833',
    '"a right," with Casey v. Smith, 5 U.S. 1 (1801)',
    '"a right" See accord Roe v. Wade, 410 U.S. 113',
    '"a right" See Accord Roe v. Wade, 410 U.S. 113',
    '"a right ." Cf. Roe v. Wade, 410 U.S. 113',
    '"a right ." Done. 410 U.S. 113',
  ])("does not attach %s", (text) => {
    expect(attached(text)).toBeNull();
  });

  it("does not skip past an Other_Reference to a later case citation", () => {
    expect(attached('"a right" 42 U.S.C. § 1983, 410 U.S. 113')).toBeNull();
  });

  it("gives a quote between two citations to the following one (13.5)", () => {
    const t = 'Roe, 410 U.S. at 153 ("a right") 5 U.S. 1';
    expect(attached(t)).toEqual(pre(t, "5 U.S."));
  });
});

describe("attachQuotes following rule _Requirements: 13.8, 13.7_", () => {
  it.each([
    ['Roe, 410 U.S. at 153 ("quoted text")', "Roe"],
    ['410 U.S. 113, 116: "quoted text"', "410"],
  ])("attaches %s", (text, cite) => {
    expect(attached(text)).toEqual(fol(text, cite));
  });

  it("takes no Gap_Signal in a following gap", () => {
    expect(attached('Roe, 410 U.S. at 153 (quoting "quoted text")')).toBeNull();
  });

  it("needs the citation and the opening mark in one Sentence", () => {
    expect(attached('See 410 U.S. 113. "quoted text"')).toBeNull();
  });

  it("lets one citation carry a following and a preceding quote", () => {
    const t = '"first" 410 U.S. 113 ("second")';
    const at = t.indexOf("410");
    expect(quotes(t).map((q) => [q.text, q.citationStart, q.rule])).toEqual([
      ["first", at, "preceding"],
      ["second", at, "following"],
    ]);
  });
});

describe("outermost quote pair wins _Requirements: 13.7, 13.10_", () => {
  it('attaches only the outer quote of `"He wrote “no” 410 U.S. 113 today." Roe v. Wade, 410 U.S. 113`', () => {
    const t = '"He wrote “no” 410 U.S. 113 today." Roe v. Wade, 410 U.S. 113';
    const later = t.lastIndexOf("410 U.S. 113");
    expect(quotes(t)).toEqual([
      {
        start: 1,
        end: t.indexOf('" Roe'),
        text: "He wrote “no” 410 U.S. 113 today.",
        citationStart: later,
        rule: "preceding",
      },
    ]);
    const starts = scanRange(t, 0, never).map((c) => c.start);
    expect(starts).toContain(t.indexOf("410 U.S. 113"));
    expect(starts).toContain(later);
  });
});
