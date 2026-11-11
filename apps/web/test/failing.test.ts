import type { CodePosition } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { failingFlags, isFailingOpener } from "../src/pane/failing";

const at = (...codes: readonly string[]): CodePosition[] =>
  codes.map((code, offset) => ({ offset, code }));

describe("failingFlags _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_", () => {
  it("flags failing openings and their closers", () => {
    expect(
      failingFlags(at("[CIT ✘]", "[/CIT]", "[CIT ?:2]", "[/CIT]", "[QUO ✘]", "[/QUO]")),
    ).toEqual([true, true, true, true, true, true]);
  });

  it("does not flag verified or unchecked openings and their closers", () => {
    expect(
      failingFlags(
        at("[CIT ✓]", "[/CIT]", "[CIT …]", "[/CIT]", "[QUO ✓]", "[/QUO]", "[QUO …]", "[/QUO]"),
      ),
    ).toEqual([false, false, false, false, false, false, false, false]);
  });

  it("keeps a quotation inside a failing citation from consuming the citation closer", () => {
    expect(failingFlags(at("[CIT ✘]", "[QUO ✓]", "[/QUO]", "[/CIT]"))).toEqual([
      true,
      false,
      false,
      true,
    ]);
    expect(failingFlags(at("[CIT ✓]", "[QUO ✘]", "[/QUO]", "[/CIT]"))).toEqual([
      false,
      true,
      true,
      false,
    ]);
  });

  it("does not flag an unbalanced closer", () => {
    expect(failingFlags(at("[/CIT]", "[/QUO]"))).toEqual([false, false]);
  });

  it("does not flag other codes", () => {
    expect(
      failingFlags(at("[HUM]", "[PST]", "[AI:r1]", "[AI>HUM:r1]", "[OVR:why]", "[REF]", "[/REF]")),
    ).toEqual([false, false, false, false, false, false, false]);
  });

  it("returns one flag per position, empty for none", () => {
    expect(failingFlags([])).toEqual([]);
  });
});

describe("isFailingOpener _Requirements: 6.4, 6.5_", () => {
  it("accepts the display form with or without brackets and rejects the rest", () => {
    for (const code of ["CIT ✘", "[CIT ✘]", "CIT ?", "[CIT ?:2]", "QUO ✘", "[QUO ✘]"]) {
      expect(isFailingOpener(code)).toBe(true);
    }
    for (const code of ["CIT ✓", "[CIT …]", "QUO ✓", "QUO …", "[/CIT]", "[HUM]", "[OVR:x]"]) {
      expect(isFailingOpener(code)).toBe(false);
    }
  });
});
