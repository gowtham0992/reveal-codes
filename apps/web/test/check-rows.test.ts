import { issues } from "@reveal-codes/engine";
import type { VerificationResult } from "@reveal-codes/engine";
import type { DisplayInfo } from "@reveal-codes/verifier/link";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { NEXT_SENTENCES, checkRows, displayFor } from "../src/client/check-rows";
import type { CheckRow } from "../src/client/check-rows";
import { TEXT, WRONG, keysOf, withResults } from "./support/case-match-region";

const DEMO = readFileSync(
  resolve(__dirname, "../../../packages/engine/fixtures/demo-motion.txt"),
  "utf8",
);

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

const NAMED = "See Henderson v. Pacific Housing Authority, 556 U.S. 662, 678 (2009).";
const UNNAMED = "See 556 U.S. 662, 678 (2009).";
const NAME = "Henderson v. Pacific Housing Authority";
const ON = { caseNames: true } as const;

describe("Case_Name_Option examples _Requirements: 19.2, 19.3, 19.4, 19.10_", () => {
  const results: readonly (readonly [string, VerificationResult])[] = [
    ["found", { status: "verified", clusterId: "145875" }],
    ["not found", { status: "not_found" }],
    ["ambiguous", { status: "ambiguous", candidates: ["1", "2"] }],
    ["unchecked", { status: "unchecked" }],
  ];

  it("option off equals rows without the argument, with no caseName field", () => {
    for (const [, result] of results) {
      const doc = withResults(NAMED, [result]);
      const off = checkRows(doc, undefined, { caseNames: false });
      expect(off).toEqual(checkRows(doc, undefined));
      for (const row of off) expect("caseName" in row).toBe(false);
    }
  });

  it.each(results)(
    "option on adds the cited name to a %s row and changes nothing else",
    (_l, result) => {
      const doc = withResults(NAMED, [result]);
      const on = checkRows(doc, undefined, ON);
      expect(on).toHaveLength(1);
      expect(on[0]?.kind).toBe("citation");
      expect(on[0]?.caseName).toBe(NAME);
      expect(on[0]).toEqual({ ...checkRows(doc, undefined)[0], caseName: NAME });
    },
  );

  it("adds no field when the citation has no case name", () => {
    for (const [, result] of results) {
      const rows = checkRows(withResults(UNNAMED, [result]), undefined, ON);
      expect(rows).toHaveLength(1);
      expect("caseName" in (rows[0] as CheckRow)).toBe(false);
    }
  });

  it("gives a wrong-case row one Cited as line, in its mismatch lines", () => {
    const rows = checkRows(withResults(NAMED, [WRONG]), undefined, ON);
    const row = rows[0];
    expect(row?.caseName).toBe(NAME);
    const cited = (row?.mismatch ?? []).filter((l) => l.startsWith("Cited as "));
    expect(cited).toEqual([`Cited as ${NAME}`]);
  });

  it("gives a quotation or orphan row no caseName field", () => {
    const text = `${DEMO} Id. at 5.`;
    const rows = checkRows(withResults(text, []), undefined, ON);
    const others = rows.filter((r) => r.kind !== "citation");
    expect(others.some((r) => r.kind === "quote")).toBe(true);
    for (const row of others) expect("caseName" in row).toBe(false);
  });
});
