import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { LEGAL_ABBREVIATIONS } from "../src/abbreviations";
import { countBoundaries } from "../src/boundary";
import {
  arbAbbreviationProse,
  arbCitationRanges,
  arbInitialProse,
  arbSentencedText,
  arbText,
  type InitialCase,
} from "../src/testing/arbitraries";
import { isValidBoundary } from "../src/validate";
import { runs } from "./support/fc";

/** Two units before the tested `.`, the `.`, the gap, and the next unit, per case. */
const INITIAL_SHAPES: Readonly<Record<InitialCase, RegExp>> = {
  joined: /^ [A-Z]\. [A-Z]$/,
  chain: /^ [A-Z]\. [A-Z]$/,
  reporter: /^ [AFP]\. [a-z]$/,
  lowercase: /^ [A-Z]\. [a-z]$/,
  digit: /^ [A-Z]\. [0-9]$/,
  vee: /^ [A-Z]\. v$/,
  etal: /^ [A-Z]\. e$/,
  twoSpaces: /^ [A-Z]\. {2}[A-Z]$/,
  newline: /^ [A-Z]\.\n[A-Z]$/,
  closer: /^ [A-Z]\.\) [A-Z]$/,
  twoLetters: /^[A-Z]{2}\. [A-Z]$/,
  glued: /^[a-z][A-Z]\. [A-Z]$/,
  paren: /^\([A-Z]\. [A-Z]$/,
};

/** True when `text[i]` lies in a Legal_Abbreviation preceded by a space or the start. */
function inSpacedAbbreviation(text: string, i: number): boolean {
  return LEGAL_ABBREVIATIONS.some((a) => {
    for (let s = Math.max(0, i - a.length + 1); s <= i; s += 1) {
      if (text.startsWith(a, s) && (s === 0 || text[s - 1] === " ")) return true;
    }
    return false;
  });
}

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

  it("arbInitialProse records each tested `.` with its case shape and its `after` Offset", () => {
    fc.assert(
      fc.property(arbInitialProse, ({ text, initials }) => {
        for (const o of initials) {
          expect(text[o.dot]).toBe(".");
          // Two units before the `.` through the first unit after the gap; a
          // leading space stands in for the start of the text.
          expect((" " + text).slice(o.dot - 1, o.after + 2)).toMatch(INITIAL_SHAPES[o.kind]);
          expect(o.splits).toBe(!["joined", "chain", "reporter"].includes(o.kind));
        }
        const dots = new Set(initials.map((o) => o.dot));
        for (const m of text.matchAll(/\./g)) {
          if (!dots.has(m.index)) expect(inSpacedAbbreviation(text, m.index)).toBe(true);
        }
      }),
      runs(),
    );
  });

  it("arbInitialProse draws every initial case across samples", () => {
    const seen = new Set(
      fc
        .sample(arbInitialProse, { numRuns: 300, seed: 5 })
        .flatMap((p) => p.initials.map((o) => o.kind)),
    );
    expect([...seen].sort()).toEqual(Object.keys(INITIAL_SHAPES).sort());
  });

  it("arbSentencedText usually contains a Sentence boundary and splits no Surrogate_Pair", () => {
    const samples = fc.sample(arbSentencedText, { numRuns: 200, seed: 11 });
    for (const t of samples) expect(t).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    const withBoundary = samples.filter((t) => countBoundaries(t, 0, t.length, [], 1) > 0);
    expect(withBoundary.length).toBeGreaterThan(samples.length / 2);
  });
});
