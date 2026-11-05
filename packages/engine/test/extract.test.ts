import { describe, expect, it } from "vitest";
import { extract } from "../src/citations/extract";
import { segment, segmentWith } from "../src/segment";
import type { Span } from "../src/types";

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

describe("extract _Requirements: 9.1, 9.9, 11.2, 11.3, 11.4_", () => {
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
