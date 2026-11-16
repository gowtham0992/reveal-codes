import { buildAppendix } from "@reveal-codes/export";
import { describe, expect, it } from "vitest";
import { recordedDocument } from "@reveal-codes/export";
import { buildDemoDocument } from "./support/export-support.js";

describe("recordedDocument", () => {
  it("parses a valid Appendix to a Document equal to the demo", async () => {
    const doc = await buildDemoDocument();
    const result = recordedDocument(buildAppendix(doc).lines);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(doc);
  });

  it("returns appendix_unparseable naming the Engine kind, index and rule for malformed codes", () => {
    const result = recordedDocument(["[DOC{", "[CIT ✓]no close"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("appendix_unparseable");
      expect(result.error.detail).toMatch(/^engine error \S+/);
      if (result.error.detail.includes("malformed_codes")) {
        expect(result.error.detail).toMatch(/ at index \d+: \S+/);
      }
    }
  });

  it("returns appendix_unparseable with a non-empty detail for an empty list", () => {
    const result = recordedDocument([]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.detail.length).toBeGreaterThan(0);
      expect(result.error.detail).toContain("engine error");
    }
  });
});

describe("body text comparison", () => {
  const same = (body: readonly string[], text: string): boolean => body.join("\n") === text;
  it.each([
    ["trailing whitespace", ["a "], "a"],
    ["tab versus spaces", ["a\tb"], "a    b"],
    ["NFC versus NFD", ["\u00e9"], "e\u0301"],
  ])("treats %s as different", (_name, body, text) => {
    expect(same(body, text)).toBe(false);
  });
  it("treats empty as equal to empty", () => {
    expect(same([], "")).toBe(true);
  });
});
