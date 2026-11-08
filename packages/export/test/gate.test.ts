import { blockingIssues, createDocument } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { canExport } from "../src/index.js";
import { buildDemoDocument } from "./support/demo-document.js";

const AT = "2026-11-20T18:25:00.000Z";

function doc(text: string): Document {
  const r = createDocument(text, AT);
  if (!r.ok) throw new Error(r.error.kind);
  return r.value;
}

describe("canExport _Requirements: 1.1, 1.2, 1.3, 1.4_", () => {
  it("is false for a Document with an unchecked citation", () => {
    const d = doc("The rule is stated in Roe v. Wade, 410 U.S. 113 (1973).");
    expect(blockingIssues(d).length).toBeGreaterThan(0);
    expect(canExport(d)).toBe(false);
  });

  it("is true for the Demo_Document, whose blocking issues are all overridden", async () => {
    const d = await buildDemoDocument();
    expect(canExport(d)).toBe(true);
  });

  it("is true for an empty Document", () => {
    expect(canExport(doc(""))).toBe(true);
  });

  it("leaves the input unchanged", () => {
    const d = doc("See 410 U.S. 113.");
    const before = structuredClone(d);
    canExport(d);
    expect(d).toEqual(before);
  });
});
