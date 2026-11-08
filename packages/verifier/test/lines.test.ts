import { createDocument } from "@reveal-codes/engine";
import type { CitationRecord } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { buildLines, memberLines } from "../src/lines";

function recordsOf(text: string): readonly CitationRecord[] {
  const doc = createDocument(text, "2026-11-02T12:00:00.000Z");
  if (!doc.ok) throw new Error("createDocument failed");
  return doc.value.citations;
}

type Full = Extract<CitationRecord, { kind: "full" }>;
function fulls(text: string): readonly Full[] {
  return recordsOf(text).filter((r): r is Full => r.kind === "full");
}

describe("buildLines", () => {
  it("lists lines in document order and drops pincites, courts and years", () => {
    const idx = buildLines(
      recordsOf("See 410 U.S. 113, 116 (1973); 598 F.3d 1, 7 (2d Cir. 2010)."),
    );
    expect(idx.lines).toEqual(["410 U.S. 113", "598 F.3d 1"]);
  });
  it("keeps the first occurrence of a duplicate line", () => {
    const idx = buildLines(recordsOf("410 U.S. 113. Later, 410 U.S. 113, 116. And 598 F.3d 1."));
    expect(idx.lines).toEqual(["410 U.S. 113", "598 F.3d 1"]);
    expect(idx.members.size).toBe(3);
  });
  it("normalises 912 F. 4th 33 to 912 F.4th 33", () => {
    expect(buildLines(recordsOf("See 912 F. 4th 33, 41 (9th Cir. 2023).")).lines).toEqual([
      "912 F.4th 33",
    ]);
  });
  it("gives one line per member of a parallel citation, in order", () => {
    const [rec] = fulls("Roe v. Wade, 410 U.S. 113, 93 S. Ct. 705 (1973).");
    expect(rec?.citation.value.kind).toBe("parallel");
    expect(rec && memberLines(rec)).toEqual(["410 U.S. 113", "93 S. Ct. 705"]);
  });
  it("marks database citations and gives them no line", () => {
    const idx = buildLines(recordsOf("See 2024 WL 123456 and 410 U.S. 113."));
    expect(idx.lines).toEqual(["410 U.S. 113"]);
    expect([...idx.members.values()]).toEqual(["database", ["410 U.S. 113"]]);
  });
  it("skips short and other records", () => {
    const records = recordsOf("410 U.S. 113. Id. at 116. See 42 U.S.C. § 1983.");
    expect(records.some((r) => r.kind === "short")).toBe(true);
    expect(records.some((r) => r.kind === "other")).toBe(true);
    const idx = buildLines(records);
    expect(idx.lines).toEqual(["410 U.S. 113"]);
    expect(idx.members.size).toBe(1);
  });
  it("marks a parallel record with zero members invalid", () => {
    const [rec] = fulls("Roe v. Wade, 410 U.S. 113, 93 S. Ct. 705 (1973).");
    if (rec === undefined || rec.citation.value.kind !== "parallel") throw new Error("setup");
    const empty: Full = {
      ...rec,
      citation: { ...rec.citation, value: { ...rec.citation.value, members: [] } },
    };
    expect(memberLines(empty)).toBe("invalid");
    expect(buildLines([empty]).members.get(empty.key)).toBe("invalid");
  });
  it("marks a member the engine cannot format invalid", () => {
    const [rec] = fulls("410 U.S. 113.");
    if (rec === undefined || rec.citation.value.kind !== "reporter") throw new Error("setup");
    const bad: Full = {
      ...rec,
      citation: { ...rec.citation, value: { ...rec.citation.value, reporter: "Q.Z." } },
    };
    expect(memberLines(bad)).toBe("invalid");
  });
});
