import { describe, expect, it } from "vitest";
import { extract } from "../src/citations/extract";
import { segment, segmentWith } from "../src/segment";
import type { ExtractedCitation, ExtractedQuote, Span } from "../src/types";
import {
  casey833,
  fol,
  idAt,
  lexis,
  marbury1,
  party,
  pre,
  rep,
  roe113,
  roe1973,
  usc1983,
} from "./support/expected";

/** `c` with the Cited_Name the Extractor reads before it (case-match Req 1.2). */
const named = (c: ExtractedCitation, caseName: string): ExtractedCitation => ({ ...c, caseName });

const oneSpan = (text: string): Span[] =>
  text.length === 0
    ? []
    : [
        {
          start: 0,
          end: text.length,
          provenance: { origin: "PST", timestamp: "2024-01-01T00:00:00Z" },
        },
      ];

/** Each citation as `[text as written, kind or form, targetStart, normalised]`. */
const summary = (text: string) =>
  extract(text).citations.map((c) => [
    c.text,
    c.value.kind === "short" ? c.value.form : c.value.kind,
    c.value.kind === "short" ? c.value.targetStart : undefined,
    c.normalised,
  ]);

describe("extract _Requirements: 9.1, 9.4, 9.9, 11.2, 11.3, 11.4_", () => {
  it("is total on the empty string and on lone surrogates", () => {
    expect(extract("")).toEqual({ citations: [], quotes: [] });
    expect(extract("\uD800")).toEqual({ citations: [], quotes: [] });
    expect(extract("a\uDC00 \uD83D 410 U.S.\uDFFF")).toEqual({ citations: [], quotes: [] });
  });

  it("finds full, parallel, Id., party, and Other citations in order, links them, and attaches quotes", () => {
    const text =
      'The Court held "the right is fundamental" Roe v. Wade, 410 U.S. 113, 153 (1973). ' +
      "See 5 U.S. 137, 2 L. Ed. 60 (1803). Id. at 140. Roe v. Wade, 410 U.S. at 154 " +
      '("a quoted holding"). See 42 U.S.C. § 1983.';
    const roe = text.indexOf("410 U.S. 113");
    const marbury = text.indexOf("5 U.S. 137");
    expect(summary(text)).toEqual([
      ["410 U.S. 113, 153 (1973)", "reporter", undefined, undefined],
      ["5 U.S. 137, 2 L. Ed. 60 (1803)", "parallel", undefined, undefined],
      ["Id. at 140", "id", marbury, undefined],
      ["Roe v. Wade, 410 U.S. at 154", "party", roe, undefined],
      ["42 U.S.C. § 1983", "other", undefined, undefined],
    ]);
    const { citations, quotes } = extract(text);
    for (const c of citations) expect(text.slice(c.start, c.end)).toBe(c.text);
    expect(quotes).toEqual([
      {
        start: text.indexOf("the right"),
        end: text.indexOf('" Roe'),
        text: "the right is fundamental",
        citationStart: roe,
        rule: "preceding",
      },
      {
        start: text.indexOf("a quoted"),
        end: text.indexOf('")'),
        text: "a quoted holding",
        citationStart: text.indexOf("Roe v. Wade, 410 U.S. at"),
        rule: "following",
      },
    ]);
  });

  it("gives a Near_Miss its Normalised_Form, and the Normalised_Form reads back with none", () => {
    const [c] = extract("410 US 113").citations;
    expect(c).toMatchObject({ start: 0, end: 10, text: "410 US 113", normalised: "410 U.S. 113" });
    expect(c?.value).toEqual({ kind: "reporter", volume: 410, reporter: "U.S.", page: 113 });
    const [back] = extract("410 U.S. 113").citations;
    expect(back?.value).toEqual(c?.value);
    expect(back).not.toHaveProperty("normalised");
  });

  it("records no Normalised_Form on a canonical citation, a Short_Form, or an Other_Reference", () => {
    const text = "598 F.3d 1, 7 (2d Cir. 2010). Id. at 9. 42 U.S.C. § 1983.";
    const { citations } = extract(text);
    expect(citations).toHaveLength(3);
    for (const c of citations) expect(c).not.toHaveProperty("normalised");
  });

  it("keeps an Other_Reference before a LEXIS citation and starts the citation at its year (D22)", () => {
    expect(extract("under 42 U.S.C. § 1983 and the court in 2023 U.S. Dist. LEXIS 5")).toEqual({
      citations: [usc1983(6), lexis(40, "2023 U.S. Dist. LEXIS 5", true, "U.S. Dist.")],
      quotes: [],
    });
  });

  it("does not let a number in a party name start a LEXIS citation (D22)", () => {
    expect(extract("Smith v. Local 2092 Union, 2023 U.S. Dist. LEXIS 5")).toEqual({
      citations: [
        named(
          lexis(27, "2023 U.S. Dist. LEXIS 5", true, "U.S. Dist."),
          "Smith v. Local 2092 Union",
        ),
      ],
      quotes: [],
    });
  });

  it("normalises a near-miss LEXIS court, keeps an unlisted one, and drops a bad one (D22)", () => {
    expect(extract("2023 US Dist. LEXIS 5").citations).toEqual([
      {
        ...lexis(0, "2023 US Dist. LEXIS 5", true, "U.S. Dist."),
        normalised: "2023 U.S. Dist. LEXIS 5",
      },
    ]);
    expect(extract("2023 Foo Cty. Ct. LEXIS 5").citations).toEqual([
      lexis(0, "2023 Foo Cty. Ct. LEXIS 5", false, "Foo Cty. Ct."),
    ]);
    expect(extract("2023 foo LEXIS 5").citations).toEqual([]);
    expect(extract("2023 Foo, Bar LEXIS 5").citations).toEqual([]);
  });

  it("ignores a Garbage_Citation and keeps the rest", () => {
    const text = "410 Q.Z. 113 and 410 U.S. 113";
    expect(summary(text)).toEqual([["410 U.S. 113", "reporter", undefined, undefined]]);
  });
});

describe("segment _Requirements: 8.5_", () => {
  it("agrees with segmentWith over extract's citations and never splits inside `U.S.`", () => {
    const text = "The rule is settled. See Roe v. Wade, 410 U.S. 113 (1973). Then it changed.";
    const spans = oneSpan(text);
    const result = segment(text, spans);
    expect(result).toEqual(segmentWith(text, spans, extract(text).citations));
    expect(result.ok && result.value.map((s) => text.slice(s.start, s.end))).toEqual([
      "The rule is settled. ",
      "See Roe v. Wade, 410 U.S. 113 (1973). ",
      "Then it changed.",
    ]);
  });

  it("returns invalid_spans for spans that break coverage, and [] for empty text", () => {
    expect(segment("", [])).toEqual({ ok: true, value: [] });
    expect(segment("abc", []).ok).toBe(false);
  });
});

describe("extract Preceding_Quote attaches _Requirements: 13.1, 8.10, D21_", () => {
  it.each<[string, ExtractedCitation[], ExtractedQuote[]]>([
    [
      '"the right ." Roe, 410 U.S. at 153.',
      [party(14, "Roe, 410 U.S. at 153", "Roe", 410, 153)],
      [pre(1, "the right .", 14)],
    ],
    [
      '"the right," Roe v. Wade, 410 U.S. 113 (1973)',
      [named(roe1973(26), "Roe v. Wade")],
      [pre(1, "the right,", 26)],
    ],
    [
      '"the right." See Roe v. Wade, 410 U.S. 113',
      [named(roe113(30), "Roe v. Wade")],
      [pre(1, "the right.", 30)],
    ],
    [
      '"the right," See Roe v. Wade, 410 U.S. 113 (1973)',
      [named(roe1973(30), "Roe v. Wade")],
      [pre(1, "the right,", 30)],
    ],
    [
      '"the right" See Planned Parenthood, 505 U.S. at 833',
      [party(16, "Planned Parenthood, 505 U.S. at 833", "Planned Parenthood", 505, 833)],
      [pre(1, "the right", 16)],
    ],
    [
      '"the right" (quoting Roe v. Wade, 410 U.S. 113)',
      [named(roe113(34), "Roe v. Wade")],
      [pre(1, "the right", 34)],
    ],
    ['"the right" (citing Casey, 505 U.S. at 833)', [casey833(20)], [pre(1, "the right", 20)]],
    [
      '"the right" See, e.g., Roe v. Wade, 410 U.S. 113',
      [named(roe113(36), "Roe v. Wade")],
      [pre(1, "the right", 36)],
    ],
    [
      '"the right" Cf. Roe v. Wade, 410 U.S. 113',
      [named(roe113(29), "Roe v. Wade")],
      [pre(1, "the right", 29)],
    ],
    // D21: the longest Gap_Signal at the gap start, `See also`, leaves a Case_Name.
    [
      '"the right" See also Roe v. Wade, 410 U.S. 113',
      [named(roe113(34), "Roe v. Wade")],
      [pre(1, "the right", 34)],
    ],
    // Req 8.10: no boundary after `Q.`, so the gap holds only the boundary after `."`.
    [
      '"the right." United States v. John Q. Public, 5 U.S. 1',
      [named(marbury1(46), "United States v. John Q. Public")],
      [pre(1, "the right.", 46)],
    ],
    [
      '"the right." Compare Roe v. Wade, 410 U.S. 113, with Casey, 505 U.S. at 833',
      [named(roe113(34), "Roe v. Wade"), casey833(53)],
      [pre(1, "the right.", 34)],
    ],
  ])("%s", (text, citations, quotes) => {
    expect(extract(text)).toEqual({ citations, quotes });
  });
});

describe("extract Preceding_Quote does not attach _Requirements: 13.1, 13.9, D19, D21_", () => {
  it.each<[string, ExtractedCitation[]]>([
    ['"the right" In Casey, 505 U.S. at 833', [casey833(15)]],
    [
      '"the right," with Casey v. Smith, 5 U.S. 1 (1801)',
      [named(rep(34, "5 U.S. 1 (1801)", 5, "U.S.", 1, { year: 1801 }), "Casey v. Smith")],
    ],
    ['"the right" See accord Roe v. Wade, 410 U.S. 113', [named(roe113(36), "Roe v. Wade")]],
    ['"the right" See Accord Roe v. Wade, 410 U.S. 113', [named(roe113(36), "Roe v. Wade")]],
    // D21: `See` would leave `also See A, Inc. v. A & A,`, a Case_Name; `See also` is tried instead.
    [
      '"the right" See also See A, Inc. v. A & A, 5 U.S. 1',
      [named(marbury1(43), "A, Inc. v. A & A")],
    ],
    ['"the right ." Cf. Roe v. Wade, 410 U.S. 113', [named(roe113(31), "Roe v. Wade")]],
    ['"the right." It was. 410 U.S. 113', [roe113(21)]],
  ])("%s", (text, citations) => {
    expect(extract(text)).toEqual({ citations, quotes: [] });
  });

  it("does not skip past an Other_Reference to a later case citation (13.1)", () => {
    expect(extract('"the right" 42 U.S.C. § 1983, 410 U.S. 113')).toEqual({
      citations: [usc1983(12), roe113(30)],
      quotes: [],
    });
  });
});

describe("extract Following_Quote and quote ownership _Requirements: 13.5, 13.6, 13.8_", () => {
  it.each<[string, ExtractedCitation, ExtractedQuote[]]>([
    [
      'Roe, 410 U.S. at 153 ("quoted text")',
      party(0, "Roe, 410 U.S. at 153", "Roe", 410, 153),
      [fol(23, "quoted text", 0)],
    ],
    [
      '410 U.S. 113, 116: "quoted text"',
      rep(0, "410 U.S. 113, 116", 410, "U.S.", 113, { pincite: 116 }),
      [fol(20, "quoted text", 0)],
    ],
    [
      'Roe, 410 U.S. at 153 (quoting "quoted text")',
      party(0, "Roe, 410 U.S. at 153", "Roe", 410, 153),
      [],
    ],
  ])("%s", (text, citation, quotes) => {
    expect(extract(text)).toEqual({ citations: [citation], quotes });
  });

  it("gives a quote between two citations to the following one (13.5)", () => {
    expect(extract('Roe, 410 U.S. at 153 ("the right") 5 U.S. 1')).toEqual({
      citations: [party(0, "Roe, 410 U.S. at 153", "Roe", 410, 153), marbury1(35)],
      quotes: [pre(23, "the right", 35)],
    });
  });

  it('pairs no quote from a `“…"` mixture (13.6)', () => {
    expect(extract('“the right" Roe v. Wade, 410 U.S. 113')).toEqual({
      citations: [named(roe113(25), "Roe v. Wade")],
      quotes: [],
    });
  });
});

describe("extract Orphans _Requirements: 12.6, 12.7_", () => {
  it("makes Id. after an Other_Reference, and Id. after that Orphan, Orphans despite an earlier Full_Citation", () => {
    const text = "410 U.S. 113 (1973); 42 U.S.C. § 1983. Id. at 5. Id. at 6.";
    expect(extract(text).citations).toEqual([
      roe1973(0),
      usc1983(21),
      idAt(39, 5, null),
      idAt(49, 6, null),
    ]);
  });
});

describe("extract earlier-opening quote pair wins _Requirements: 13.7, 13.10, D20_", () => {
  it.each<[string, ExtractedCitation[], ExtractedQuote[]]>([
    [
      '"He wrote “no” 410 U.S. 113 today." Roe v. Wade, 410 U.S. 113',
      [roe113(15), named(roe113(49), "Roe v. Wade")],
      [pre(1, "He wrote “no” 410 U.S. 113 today.", 49)],
    ],
    ['"a “b" 410 U.S. 113 c” 5 U.S. 1', [roe113(7), marbury1(23)], [pre(1, "a “b", 7)]],
    ['Roe, 410 U.S. 113 ("a “b" c”) 5 U.S. 1', [roe113(5), marbury1(30)], [fol(20, "a “b", 5)]],
  ])("%s", (text, citations, quotes) => {
    expect(extract(text)).toEqual({ citations, quotes });
  });
});
