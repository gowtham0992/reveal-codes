import { createDocument } from "@reveal-codes/engine";
import type { VerificationResult } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { planLookup, resultsForRecords } from "../src/lookup";

function plan(text: string) {
  const doc = createDocument(text, "2026-11-02T12:00:00.000Z");
  if (!doc.ok) throw new Error("createDocument failed");
  return {
    p: planLookup(doc.value.citations),
    keys: doc.value.citations.flatMap((c) => ("key" in c ? [c.key] : [])),
  };
}

const verified = (id: string): VerificationResult => ({ status: "verified", clusterId: id });
const marker: VerificationResult = { status: "ambiguous", candidates: ["a", "b"] };

describe("planLookup", () => {
  it("plans unique lines in chunks and indexes every Full_Record", () => {
    const { p } = plan("410 U.S. 113. Id. at 5. 410 U.S. 113. 2024 WL 123456. 598 F.3d 1.");
    expect(p.lines).toEqual(["410 U.S. 113", "598 F.3d 1"]);
    expect(p.chunks).toEqual([{ lines: p.lines, oversize: false }]);
    expect(p.index.members.size).toBe(4);
  });
  it("plans nothing for text with no Full_Records", () => {
    const { p } = plan("No citations. Id. at 5.");
    expect(p.lines).toEqual([]);
    expect(p.chunks).toEqual([]);
  });
});

describe("resultsForRecords", () => {
  it("gives database records a bare unchecked and one-member records their line result", () => {
    const { p, keys } = plan("2024 WL 123456. 410 U.S. 113.");
    const r = resultsForRecords(p.index, new Map([["410 U.S. 113", verified("9")]]), () => marker);
    expect(r.get(keys[0] ?? "")).toEqual({ status: "unchecked" });
    expect(r.get(keys[1] ?? "")).toEqual(verified("9"));
  });
  it("calls combine with the member results, in member order, for a parallel record", () => {
    const { p, keys } = plan("Roe v. Wade, 410 U.S. 113, 93 S. Ct. 705 (1973).");
    let seen: readonly VerificationResult[] = [];
    const r = resultsForRecords(
      p.index,
      new Map([
        ["410 U.S. 113", verified("1")],
        ["93 S. Ct. 705", { status: "not_found" }],
      ]),
      (m) => {
        seen = m;
        return marker;
      },
    );
    expect(seen).toEqual([verified("1"), { status: "not_found" }]);
    expect(r.get(keys[0] ?? "")).toEqual(marker);
  });
  it("treats a line with no result as unchecked", () => {
    const { p, keys } = plan("410 U.S. 113.");
    expect(resultsForRecords(p.index, new Map(), () => marker).get(keys[0] ?? "")).toEqual({
      status: "unchecked",
    });
  });
});
