import { issues } from "@reveal-codes/engine";
import type { VerificationResult } from "@reveal-codes/engine";
import type { DisplayInfo } from "@reveal-codes/verifier/link";
import { describe, expect, it } from "vitest";
import { NEXT_SENTENCES, checkRows, displayFor } from "../src/client/check-rows";
import { TEXT, WRONG, keysOf, withResults } from "./support/case-match-region";

const INFO: DisplayInfo = {
  clusterId: "145875",
  foundName: "Ashcroft v. Iqbal",
  foundYear: 2009,
  absoluteUrl: "/opinion/145875/x/",
};

describe("Shared_Rows examples _Requirements: 6.6, 6.7, 7.3, 7.4_", () => {
  it("displayFor returns info only when the cluster id matches", () => {
    expect(displayFor("145875", INFO)).toBe(INFO);
    expect(displayFor("999", INFO)).toBeUndefined();
    expect(displayFor("145875", undefined)).toBeUndefined();
  });

  it("NEXT_SENTENCES has six entries and none contains an exclamation mark", () => {
    const sentences = Object.values(NEXT_SENTENCES);
    expect(sentences).toHaveLength(6);
    for (const s of sentences) expect(s).not.toContain("!");
  });

  it("gives a linked short form no row", () => {
    const text = "See Smith v. Jones, 556 U.S. 662, 678 (2009). Id. at 670.";
    const verified: VerificationResult = { status: "verified", clusterId: "145875" };
    const doc = withResults(text, [verified]);
    expect(doc.citations.some((c) => c.kind !== "full")).toBe(true);
    const rows = checkRows(doc, undefined);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("citation");
    expect(rows[0]?.code).toBe("CIT ✓");
  });

  it("carries mismatch lines and an href on a wrong-case row", () => {
    const doc = withResults(TEXT, [WRONG]);
    const key = keysOf(doc)[0];
    const rows = checkRows(doc, new Map([[key ?? "", INFO]]));
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.code).toBe("CIT ≠");
    expect(row?.mismatch).toEqual([
      "Cited as Henderson v. Pacific Housing Authority",
      "This citation is Ashcroft v. Iqbal (2009)",
    ]);
    expect(row?.href).toBe("https://www.courtlistener.com/opinion/145875/x/");
    expect(row?.next).toBe(NEXT_SENTENCES["CIT ≠"]);
    expect(rows.map((r) => r.key)).toEqual(issues(doc).map((i) => i.key));
  });
});
