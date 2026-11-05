import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { LEGAL_ABBREVIATIONS } from "../src/abbreviations";
import { countBoundaries } from "../src/boundary";
import {
  arbAbbreviationProse,
  arbCitationRanges,
  arbSentencedText,
  arbText,
} from "../src/testing/arbitraries";
import { isValidBoundary } from "../src/validate";
import { runs } from "./support/fc";

describe("segmentation input arbitraries meet their definitions _Requirements: 22.1_", () => {
  it("arbCitationRanges are sorted, non-overlapping, non-empty, on Valid_Boundaries", () => {
    const arb = arbText.chain((t) => arbCitationRanges(t).map((rs) => ({ t, rs })));
    fc.assert(
      fc.property(arb, ({ t, rs }) => {
        let prevEnd = 0;
        for (const r of rs) {
          expect(r.start).toBeGreaterThanOrEqual(prevEnd);
          expect(r.start).toBeLessThan(r.end);
          expect(r.end).toBeLessThanOrEqual(t.length);
          expect(isValidBoundary(t, r.start)).toBe(true);
          expect(isValidBoundary(t, r.end)).toBe(true);
          prevEnd = r.end;
        }
      }),
      runs(),
    );
  });

  it("arbCitationRanges splits no Surrogate_Pair in a text made only of pairs", () => {
    const t = "\u{1F600}".repeat(8);
    for (const rs of fc.sample(arbCitationRanges(t), { numRuns: 200, seed: 7 })) {
      for (const r of rs) expect((r.start % 2) + (r.end % 2)).toBe(0);
    }
  });

  it("arbAbbreviationProse places each abbreviation, then a space and a capitalised word", () => {
    fc.assert(
      fc.property(arbAbbreviationProse, ({ text, abbreviations }) => {
        for (const a of abbreviations) {
          expect(LEGAL_ABBREVIATIONS).toContain(a.abbreviation);
          expect(text.slice(a.start, a.end)).toBe(a.abbreviation);
          expect(a.start === 0 || text[a.start - 1] === " ").toBe(true);
          expect(text.slice(a.end)).toMatch(/^ [A-Z][a-z]*(?: |$)/);
        }
        const periods = text.replace(/[^.]/g, "").length;
        const recorded = abbreviations.reduce(
          (n, a) => n + a.abbreviation.split(".").length - 1,
          0,
        );
        expect(periods).toBe(recorded);
      }),
      runs(),
    );
  });

  it("arbAbbreviationProse draws every Legal_Abbreviation across samples", () => {
    const seen = new Set(
      fc
        .sample(arbAbbreviationProse, { numRuns: 500, seed: 3 })
        .flatMap((p) => p.abbreviations.map((a) => a.abbreviation)),
    );
    expect([...seen].sort()).toEqual([...LEGAL_ABBREVIATIONS].sort());
  });

  it("arbSentencedText usually contains a Sentence boundary and splits no Surrogate_Pair", () => {
    const samples = fc.sample(arbSentencedText, { numRuns: 200, seed: 11 });
    for (const t of samples) expect(t).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    const withBoundary = samples.filter((t) => countBoundaries(t, 0, t.length, [], 1) > 0);
    expect(withBoundary.length).toBeGreaterThan(samples.length / 2);
  });
});
