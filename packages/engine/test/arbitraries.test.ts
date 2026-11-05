import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { checkCoverage, normaliseSpans, originAt } from "../src/spans";
import {
  arbAnyString,
  arbLabelling,
  arbSpanCorruption,
  arbSpanFragmentation,
  arbStringWithLoneSurrogate,
  arbText,
  arbTimestamp,
} from "../src/testing/arbitraries";
import { firstUnpairedSurrogate, isTimestamp, isValidBoundary } from "../src/validate";
import { runs } from "./support/fc";

const runIdAt = (
  spans: readonly { start: number; end: number; provenance: { runId?: string } }[],
  i: number,
) => spans.find((s) => s.start <= i && i < s.end)?.provenance.runId;

describe("text arbitraries meet their definitions _Requirements: 22.1, 22.4_", () => {
  it("arbText is at most 2,000 code units with no unpaired surrogate", () => {
    fc.assert(
      fc.property(arbText, (t) => {
        expect(t.length).toBeLessThanOrEqual(2000);
        expect(firstUnpairedSurrogate(t)).toBeNull();
      }),
      runs(),
    );
  });

  it("arbTimestamp passes isTimestamp", () => {
    fc.assert(
      fc.property(arbTimestamp, (ts) => {
        expect(isTimestamp(ts)).toBe(true);
      }),
      runs(),
    );
  });

  it("arbStringWithLoneSurrogate records the first unpaired Offset", () => {
    fc.assert(
      fc.property(arbStringWithLoneSurrogate, ({ text, offset }) => {
        expect(firstUnpairedSurrogate(text)).toBe(offset);
      }),
      runs(),
    );
  });

  it("arbAnyString produces lone surrogates across samples", () => {
    const samples = fc.sample(arbAnyString, { numRuns: 500, seed: 1 });
    expect(samples.some((s) => firstUnpairedSurrogate(s) !== null)).toBe(true);
  });
});

describe("span arbitraries meet their definitions _Requirements: 22.1, 22.4_", () => {
  it("arbSpanFragmentation is valid, cuts at Valid_Boundaries, and keeps the labelling", () => {
    const arb = arbText.chain((t) =>
      arbLabelling(t).chain((l) => arbSpanFragmentation(t, l).map((f) => ({ t, l, f }))),
    );
    fc.assert(
      fc.property(arb, ({ t, l, f }) => {
        expect(checkCoverage(t.length, f).ok).toBe(true);
        for (const s of f) expect(isValidBoundary(t, s.start)).toBe(true);
        for (let i = 0; i < t.length; i++) {
          expect(originAt(f, i)).toBe(originAt(l, i));
          expect(runIdAt(f, i)).toBe(runIdAt(l, i));
        }
      }),
      runs(),
    );
  });

  it("arbSpanCorruption records the error checkCoverage and normaliseSpans report", () => {
    fc.assert(
      fc.property(arbSpanCorruption, ({ text, spans, expected }) => {
        expect(checkCoverage(text.length, spans)).toEqual({ ok: false, error: expected });
        expect(normaliseSpans(text.length, spans)).toEqual({ ok: false, error: expected });
      }),
      runs(),
    );
  });

  it("arbSpanCorruption generates every violation kind", () => {
    const kinds = new Set(
      fc.sample(arbSpanCorruption, { numRuns: 500, seed: 1 }).map((c) => c.expected.violation),
    );
    expect([...kinds].sort()).toEqual(["coverage", "empty", "gap", "overlap", "unsorted"]);
  });
});
