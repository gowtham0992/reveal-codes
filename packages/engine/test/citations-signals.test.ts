import { describe, expect, it } from "vitest";
import {
  GAP_SIGNALS,
  MAX_GAP_SIGNAL,
  SIGNALS,
  gapSignalsAt,
  startsWithSignal,
} from "../src/citations/signals";

describe("SIGNALS and GAP_SIGNALS _Requirements: 13.1_", () => {
  it("lists the fourteen Signals in Glossary order", () => {
    expect(SIGNALS).toEqual([
      "See",
      "See also",
      "See, e.g.,",
      "E.g.,",
      "Accord",
      "Cf.",
      "But see",
      "Compare",
      "Citing",
      "Quoting",
      "But cf.",
      "Contra",
      "E.g.",
      "See generally",
    ]);
  });

  it("holds the ten Gap_Signals and their first-letter-lowercase forms", () => {
    expect(GAP_SIGNALS).toHaveLength(20);
    expect(GAP_SIGNALS.slice(0, 10)).toEqual(SIGNALS.slice(0, 10));
    expect(GAP_SIGNALS.slice(10)).toEqual([
      "see",
      "see also",
      "see, e.g.,",
      "e.g.,",
      "accord",
      "cf.",
      "but see",
      "compare",
      "citing",
      "quoting",
    ]);
    expect(GAP_SIGNALS).not.toContain("with");
    expect(SIGNALS).not.toContain("with");
    expect(SIGNALS).not.toContain("see");
  });

  it("MAX_GAP_SIGNAL is the longest Gap_Signal", () => {
    expect(Math.max(...GAP_SIGNALS.map((s) => s.length))).toBe(MAX_GAP_SIGNAL);
  });
});

describe("startsWithSignal _Requirements: 9.2, 12.8_", () => {
  it("accepts a Signal followed by a space, a comma, or the end of the range", () => {
    expect(startsWithSignal("See Roe", 0, 7)).toBe(true);
    expect(startsWithSignal("See, e.g., Roe", 0, 14)).toBe(true);
    expect(startsWithSignal("xx Cf.", 3, 6)).toBe(true);
    expect(startsWithSignal("Contra Roe", 0, 6)).toBe(true);
  });

  it("rejects a Signal that runs into a word, lowercase forms, and ranges too short", () => {
    expect(startsWithSignal("Seeds Co.", 0, 9)).toBe(false);
    expect(startsWithSignal("see Roe", 0, 7)).toBe(false);
    expect(startsWithSignal("See Roe", 0, 2)).toBe(false);
    expect(startsWithSignal("With Roe", 0, 8)).toBe(false);
  });
});

describe("gapSignalsAt _Requirements: 13.1_", () => {
  it("returns every Gap_Signal end at the Offset, ascending, bounded by limit", () => {
    const t = '" See, e.g., Roe';
    expect(gapSignalsAt(t, 2, t.length)).toEqual([5, 12]);
    expect(gapSignalsAt(t, 2, 11)).toEqual([5]);
    expect(gapSignalsAt("see also Roe", 0, 12)).toEqual([3, 8]);
    expect(gapSignalsAt("quoting Roe", 0, 11)).toEqual([7]);
  });

  it("finds nothing for `with`, mixed case, or a bad Offset", () => {
    expect(gapSignalsAt("with Roe", 0, 8)).toEqual([]);
    expect(gapSignalsAt("CITING Roe", 0, 10)).toEqual([]);
    expect(gapSignalsAt("See", -1, 3)).toEqual([]);
  });
});
