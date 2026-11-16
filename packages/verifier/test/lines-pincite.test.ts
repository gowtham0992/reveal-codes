import { createDocument } from "@reveal-codes/engine";
import type { CitationRecord } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { memberLines } from "../src/lines";

function fullRecord(text: string): Extract<CitationRecord, { kind: "full" }> {
  const doc = createDocument(text, "2026-11-02T12:00:00.000Z");
  if (!doc.ok) throw new Error("createDocument failed");
  const rec = doc.value.citations.find((r) => r.kind === "full");
  if (rec === undefined) throw new Error("no full record");
  return rec;
}

describe("memberLines with a pincite range _Requirements: 18.12_", () => {
  it("the ranged Miller text gives the lines of the single-page text", () => {
    const ranged = fullRecord(
      "Miller v. United Airlines, Inc., 174 F.3d 366, 371-72 (2d Cir. 1999).",
    );
    const single = fullRecord("Miller v. United Airlines, Inc., 174 F.3d 366, 371 (2d Cir. 1999).");
    expect(ranged.citation.text).toBe("174 F.3d 366, 371-72 (2d Cir. 1999)");
    expect(memberLines(ranged)).toEqual(["174 F.3d 366"]);
    expect(memberLines(ranged)).toEqual(memberLines(single));
  });
});
