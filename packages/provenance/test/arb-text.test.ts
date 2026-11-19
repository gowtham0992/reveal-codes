import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { arbFileText, arbLines, arbPath } from "../src/testing/arbitraries.js";

const sample = <T>(arb: fc.Arbitrary<T>): T[] => fc.sample(arb, { numRuns: 600, seed: 3202 });

describe("arb-text (Requirement 16.14)", () => {
  const texts = sample(arbFileText);
  const has = (test: (t: string) => boolean): boolean => texts.some(test);

  it("generates strings", () => {
    expect(texts.every((t) => typeof t === "string")).toBe(true);
  });

  it("produces each listed feature at least once", () => {
    expect(has((t) => t === "")).toBe(true);
    expect(has((t) => t.startsWith("\uFEFF"))).toBe(true);
    expect(has((t) => t.includes("\r\n"))).toBe(true);
    expect(has((t) => /[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(t))).toBe(true);
    expect(has((t) => t.includes("[") && t.includes("]") && t.includes("\\"))).toBe(true);
    expect(has((t) => t.split("\n").some((l) => l.length >= 1000))).toBe(true);
    expect(has((t) => t !== "" && !t.endsWith("\n"))).toBe(true);
  });

  it("generates lines without line terminators", () => {
    for (const lines of sample(arbLines)) {
      expect(lines.every((l) => !l.includes("\n") && !l.includes("\r"))).toBe(true);
    }
  });

  it("generates paths with no .. segment, no leading slash and no NUL", () => {
    for (const p of sample(arbPath)) {
      expect(p.length).toBeGreaterThan(0);
      expect(p.startsWith("/")).toBe(false);
      expect(p.includes("\0")).toBe(false);
      expect(p.split("/")).not.toContain("..");
    }
  });
});
