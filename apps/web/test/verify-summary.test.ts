import { createDocument, setQuoteCheck, setVerification } from "@reveal-codes/engine";
import type { Document, QuoteCheckResult, VerificationResult } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import type { VerifyOutcome } from "../src/client/verify-flow";
import {
  FAILED_NOTICE,
  checkedStamp,
  furtherLine,
  localTime,
  summaryLines,
  tallyDocument,
} from "../src/client/verify-summary";
import { ISO } from "./support/persist-fixtures";

const TEXT =
  'See Foo v. Bar, 100 U.S. 100 (2000) ("alpha"). See Baz v. Qux, 200 U.S. 200 (2001) ("beta"). ' +
  "See Ann v. Lee, 300 U.S. 300 (2002). See Roe v. Doe, 400 U.S. 400 (2003).";

function build(
  results: readonly VerificationResult[],
  quotes: readonly QuoteCheckResult[] = [],
): Document {
  const created = createDocument(TEXT, ISO);
  if (!created.ok) throw new Error("rejected");
  let doc = created.value;
  const fulls = doc.citations.flatMap((c) => (c.kind === "full" ? [c.key] : []));
  results.forEach((result, i) => {
    const key = fulls[i];
    if (key === undefined) throw new Error("missing citation");
    const next = setVerification(doc, key, result);
    if (!next.ok) throw new Error("rejected");
    doc = next.value;
  });
  quotes.forEach((result, i) => {
    const key = doc.quotes[i]?.key;
    if (key === undefined) throw new Error("missing quote");
    const next = setQuoteCheck(doc, key, result);
    if (!next.ok) throw new Error("rejected");
    doc = next.value;
  });
  return doc;
}

const OUTCOME: VerifyOutcome = {
  status: "completed",
  citations: { verified: 0, wrong_case: 0, not_found: 0, ambiguous: 0, unchecked: 0 },
  quotes: { match: 0, mismatch: 0, unchecked: 0 },
  skipped: 0,
  unavailable: 0,
};

const hhmm = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const ALL: readonly VerificationResult[] = [
  { status: "verified", clusterId: "1" },
  { status: "not_found" },
  { status: "ambiguous", candidates: ["1", "2"] },
  { status: "unchecked" },
];

describe("summaryLines _Requirements: 5.6, 5.7, 5.8, 5.9, 5.10_", () => {
  it("lists every term, then the Checked line", () => {
    const doc = build(ALL, [{ status: "match" }, { status: "mismatch", prefixLength: 1 }]);
    expect(tallyDocument(doc).citations).toEqual({
      verified: 1,
      wrong_case: 0,
      not_found: 1,
      ambiguous: 1,
      unchecked: 1,
    });
    expect(summaryLines(doc, ISO, null, new Date(ISO))).toEqual([
      "Citations: 1 found · 1 not found · 1 ambiguous · 1 not checked",
      "Quotations: 1 match · 1 not in the opinion",
      `Checked ${hhmm(ISO)}`,
    ]);
  });

  it("drops zero terms", () => {
    const doc = build([
      { status: "verified", clusterId: "1" },
      { status: "verified", clusterId: "2" },
    ]);
    expect(summaryLines(doc, ISO, null, new Date(ISO))[0]).toBe(
      "Citations: 2 found · 2 not checked",
    );
  });

  it("drops a line with no terms whole", () => {
    const created = createDocument("No citations here.", ISO);
    if (!created.ok) throw new Error("rejected");
    expect(summaryLines(created.value, ISO, null, new Date(ISO))).toEqual([`Checked ${hhmm(ISO)}`]);
  });

  it("leaves out the Checked line for an unparseable time and appends the further line", () => {
    const lines = summaryLines(
      build(ALL),
      "not a date",
      "Some items were skipped; try Verify again.",
      new Date(ISO),
    );
    expect(lines.some((l) => l.startsWith("Checked"))).toBe(false);
    expect(lines[lines.length - 1]).toBe("Some items were skipped; try Verify again.");
  });
});

describe("checkedStamp", () => {
  const at = new Date(2026, 10, 21, 12, 56).toISOString();
  it("shows the time only for a check made today", () => {
    expect(checkedStamp(at, new Date(2026, 10, 21, 23, 59))).toBe("12:56");
  });
  it("adds the local date for a check made on an earlier day", () => {
    expect(checkedStamp(at, new Date(2026, 10, 22, 0, 1))).toBe("21 Nov 2026, 12:56");
    expect(checkedStamp(new Date(2026, 0, 5, 9, 3).toISOString(), new Date(2027, 0, 1))).toBe(
      "5 Jan 2026, 09:03",
    );
  });
  it("shows the time only for a check dated after now, and null for garbage", () => {
    expect(checkedStamp(at, new Date(2026, 10, 20, 8, 0))).toBe("12:56");
    expect(checkedStamp("nope", new Date())).toBeNull();
  });
  it("puts the stamp in the Checked line", () => {
    const created = createDocument("No citations here.", ISO);
    if (!created.ok) throw new Error("rejected");
    expect(summaryLines(created.value, at, null, new Date(2026, 10, 23))).toEqual([
      "Checked 21 Nov 2026, 12:56",
    ]);
  });
});

describe("furtherLine and localTime _Requirements: 5.11, 5.12, 5.13_", () => {
  it("names the latest of two retry times", () => {
    const early = "2026-11-02T12:30:00.000Z";
    const late = "2026-11-02T14:45:00.000Z";
    const doc = build([
      { status: "unchecked", waitUntil: late },
      { status: "unchecked", waitUntil: early },
    ]);
    expect(furtherLine(OUTCOME, doc)).toBe(
      `Some items were not checked; try Verify again after ${hhmm(late)}.`,
    );
  });

  it("uses the skipped sentence for skipped or unavailable items", () => {
    const doc = build(ALL);
    expect(furtherLine({ ...OUTCOME, skipped: 1 }, doc)).toBe(
      "Some items were skipped; try Verify again.",
    );
    expect(furtherLine({ ...OUTCOME, unavailable: 2 }, doc)).toBe(
      "Some items were skipped; try Verify again.",
    );
  });

  it("is null on a clean run and unless the run completed", () => {
    const doc = build([{ status: "unchecked", waitUntil: ISO }]);
    expect(furtherLine(OUTCOME, build([{ status: "verified", clusterId: "1" }]))).toBeNull();
    expect(furtherLine({ ...OUTCOME, status: "failed", skipped: 1 }, doc)).toBeNull();
    expect(furtherLine({ ...OUTCOME, status: "discarded", skipped: 1 }, doc)).toBeNull();
  });

  it("localTime pads local hours and minutes and rejects garbage", () => {
    expect(localTime(ISO)).toBe(hhmm(ISO));
    expect(localTime(ISO)).toMatch(/^\d{2}:\d{2}$/);
    expect(localTime("nope")).toBeNull();
  });

  it("keeps the failure text", () => {
    expect(FAILED_NOTICE).toBe(
      "Verification could not be completed. Your citations are unchanged.",
    );
  });
});
