import { createDocument, issues, setQuoteCheck, setVerification } from "@reveal-codes/engine";
import type { Document, QuoteCheckResult, VerificationResult } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { markRanges } from "../src/editor/marks";

const ISO = "2026-11-02T12:00:00.000Z";
const CITE = "Roe v. Wade, 410 U.S. 113, 120 (1973)";
const QUOTE = "the quick brown fox jumps over the lazy dog";
const TEXT = `See ${CITE} ("${QUOTE}").`;

function build(): Document {
  const created = createDocument(TEXT, ISO);
  if (!created.ok) throw new Error("fixture rejected");
  return created.value;
}

function citationKey(doc: Document): string {
  const issue = issues(doc).find((i) => i.kind === "citation");
  if (issue === undefined) throw new Error("fixture has no citation issue");
  return issue.key;
}

function quoteKey(doc: Document): string {
  const quote = doc.quotes[0];
  if (quote === undefined) throw new Error("fixture has no quote");
  return quote.key;
}

function verified(doc: Document, result: VerificationResult): Document {
  const set = setVerification(doc, citationKey(doc), result);
  if (!set.ok) throw new Error("verification rejected");
  return set.value;
}

function quoted(doc: Document, result: QuoteCheckResult): Document {
  const set = setQuoteCheck(doc, quoteKey(doc), result);
  if (!set.ok) throw new Error("quote check rejected");
  return set.value;
}

describe("markRanges _Requirements: 11.1, 11.2, 11.5, 12.10_", () => {
  it("marks a wrong case citation with the found name and year, or the name alone", () => {
    const withYear = verified(build(), {
      status: "wrong_case",
      clusterId: "145875",
      foundName: "Ashcroft v. Iqbal",
      foundYear: 2009,
    });
    expect(markRanges(withYear).map((m) => [m.code, m.title])).toEqual([
      ["CIT ≠", "This citation is Ashcroft v. Iqbal (2009)"],
    ]);
    const noYear = verified(build(), {
      status: "wrong_case",
      clusterId: "145875",
      foundName: "Ashcroft v. Iqbal",
    });
    expect(markRanges(noYear).map((m) => m.title)).toEqual(["This citation is Ashcroft v. Iqbal"]);
  });
  it("marks a not found citation with its Issue range and title", () => {
    const doc = verified(build(), { status: "not_found" });
    const issue = issues(doc).find((i) => i.code === "CIT ✘");
    if (issue === undefined) throw new Error("no CIT ✘ issue");
    expect(markRanges(doc)).toEqual([
      { start: issue.start, end: issue.end, code: "CIT ✘", title: "Citation not found" },
    ]);
  });

  it("marks an ambiguous citation", () => {
    const doc = verified(build(), { status: "ambiguous", candidates: ["1", "2"] });
    const issue = issues(doc).find((i) => i.code === "CIT ?");
    if (issue === undefined) throw new Error("no CIT ? issue");
    expect(markRanges(doc)).toEqual([
      { start: issue.start, end: issue.end, code: "CIT ?", title: "Citation ambiguous" },
    ]);
  });

  it("marks a quote that is not in the opinion", () => {
    const doc = quoted(verified(build(), { status: "verified", clusterId: "1" }), {
      status: "mismatch",
      prefixLength: 4,
    });
    const issue = issues(doc).find((i) => i.code === "QUO ✘");
    if (issue === undefined) throw new Error("no QUO ✘ issue");
    expect(markRanges(doc)).toEqual([
      { start: issue.start, end: issue.end, code: "QUO ✘", title: "Quotation not in the opinion" },
    ]);
  });

  it("marks nothing for CIT … and QUO … (unchecked document)", () => {
    const doc = build();
    expect(issues(doc).map((i) => i.code)).toContain("CIT …");
    expect(markRanges(doc)).toEqual([]);
  });

  it("marks nothing for CIT ✓ and QUO ✓", () => {
    const doc = quoted(verified(build(), { status: "verified", clusterId: "1" }), {
      status: "match",
    });
    expect(issues(doc)).toEqual([]);
    expect(markRanges(doc)).toEqual([]);
  });
});
