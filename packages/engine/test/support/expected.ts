/**
 * Builders for exact expected Extractions in extract.test.ts (task 5.32).
 * Every builder sets `end` to `start + text.length`, so a test states only
 * the start Offset and the text as written. Kept here so extract.test.ts
 * stays under the 300-line module limit.
 */
import type { ExtractedCitation, ExtractedQuote } from "../../src/types";

export const rep = (
  start: number,
  text: string,
  volume: number,
  reporter: string,
  page: number,
  extra: Readonly<{ pincite?: number; year?: number }> = {},
): ExtractedCitation => ({
  start,
  end: start + text.length,
  text,
  value: { kind: "reporter", volume, reporter, page, ...extra },
});

/** A party Short_Form in `U.S.`; an Orphan unless `targetStart` is given. */
export const party = (
  start: number,
  text: string,
  name: string,
  volume: number,
  pincite: number,
  targetStart: number | null = null,
): ExtractedCitation => ({
  start,
  end: start + text.length,
  text,
  value: {
    kind: "short",
    form: "party",
    party: name,
    volume,
    reporter: "U.S.",
    pincite,
    targetStart,
  },
});

/** `Id. at <pincite>`. */
export const idAt = (
  start: number,
  pincite: number,
  targetStart: number | null,
): ExtractedCitation => {
  const text = `Id. at ${String(pincite)}`;
  return {
    start,
    end: start + text.length,
    text,
    value: { kind: "short", form: "id", pincite, targetStart },
  };
};

/** The Other_Reference `42 U.S.C. § 1983`. */
export const usc1983 = (start: number): ExtractedCitation => ({
  start,
  end: start + 16,
  text: "42 U.S.C. § 1983",
  value: { kind: "other", form: "usc", title: 42, section: "1983" },
});

/** A `2023 <court> LEXIS 5` Database_Citation with no pincite. */
export const lexis = (
  start: number,
  text: string,
  lexisCourtListed: boolean,
  lexisCourt: string,
): ExtractedCitation => ({
  start,
  end: start + text.length,
  text,
  value: {
    kind: "database",
    year: 2023,
    designator: "LEXIS",
    lexisCourtListed,
    lexisCourt,
    number: 5,
  },
});

export const roe113 = (start: number): ExtractedCitation =>
  rep(start, "410 U.S. 113", 410, "U.S.", 113);
export const roe1973 = (start: number): ExtractedCitation =>
  rep(start, "410 U.S. 113 (1973)", 410, "U.S.", 113, { year: 1973 });
export const marbury1 = (start: number): ExtractedCitation => rep(start, "5 U.S. 1", 5, "U.S.", 1);
export const casey833 = (start: number): ExtractedCitation =>
  party(start, "Casey, 505 U.S. at 833", "Casey", 505, 833);

export const pre = (start: number, text: string, citationStart: number): ExtractedQuote => ({
  start,
  end: start + text.length,
  text,
  citationStart,
  rule: "preceding",
});

export const fol = (start: number, text: string, citationStart: number): ExtractedQuote => ({
  ...pre(start, text, citationStart),
  rule: "following",
});
