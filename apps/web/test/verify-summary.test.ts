import { describe, expect, it } from "vitest";
import { summaryNotice } from "../src/client/verify-summary";

describe("summaryNotice _Requirements: 17.8, 17.10_", () => {
  it("formats the completed summary exactly", () => {
    expect(
      summaryNotice({
        status: "completed",
        citations: { verified: 2, not_found: 3, ambiguous: 0, unchecked: 0 },
        quotes: { match: 1, mismatch: 1, unchecked: 0 },
        skipped: 0,
        unavailable: 0,
      }),
    ).toBe(
      "Citations: 2 verified, 3 not found, 0 ambiguous, 0 unchecked. Quotes: 1 match, 1 mismatch, 0 unchecked. Skipped: 0. Opinions unavailable: 0.",
    );
  });

  it("failed has the fixed failure text and discarded is empty", () => {
    const base = {
      citations: { verified: 0, not_found: 0, ambiguous: 0, unchecked: 0 },
      quotes: { match: 0, mismatch: 0, unchecked: 0 },
      skipped: 0,
      unavailable: 0,
    };
    expect(summaryNotice({ ...base, status: "failed" })).toBe(
      "Verification could not be completed. Your citations are unchanged.",
    );
    expect(summaryNotice({ ...base, status: "discarded" })).toBe("");
  });
});
