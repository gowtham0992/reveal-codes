import { describe, expect, it } from "vitest";
import { effectiveProvenance, spliceSpans, spliceText } from "../src/ops/splice";
import type { Provenance, RunEntry, Span } from "../src/types";

const T1 = "2026-11-03T10:00:00Z";
const T2 = "2026-11-03T10:05:00Z";

const hum = (timestamp = T1): Provenance => ({ origin: "HUM", timestamp });
const pst = (timestamp = T1): Provenance => ({ origin: "PST", timestamp });
const ai = (runId: string, timestamp = T1): Provenance => ({ origin: "AI", runId, timestamp });
const span = (start: number, end: number, provenance: Provenance): Span => ({
  start,
  end,
  provenance,
});
const run = (runId: string, relabelled: boolean): RunEntry => ({
  runId,
  originalLength: 10,
  editedCount: 0,
  relabelled,
});

describe("spliceText _Requirements: 4.1, 4.4_", () => {
  it("inserts, deletes, and replaces by code-unit slicing", () => {
    expect(spliceText("abcdef", 3, 3, "XY")).toBe("abcXYdef");
    expect(spliceText("abcdef", 1, 4, "")).toBe("aef");
    expect(spliceText("abcdef", 0, 6, "Z")).toBe("Z");
  });

  it("keeps surrogate pairs intact when the boundaries are valid", () => {
    const text = "a\u{1F600}b\u{1F4DA}c"; // pairs at [1, 3) and [4, 6)
    expect(spliceText(text, 3, 3, "\u{2696}\u{FE0F}")).toBe(
      "a\u{1F600}\u{2696}\u{FE0F}b\u{1F4DA}c",
    );
    expect(spliceText(text, 1, 3, "")).toBe("ab\u{1F4DA}c");
    expect(spliceText(text, 4, 6, "\u{1F600}")).toBe("a\u{1F600}b\u{1F600}c");
  });
});

describe("effectiveProvenance _Requirements: 6.11_", () => {
  const runs = [run("r1", false), run("r2", true), run("r3", false)];

  it("turns AI under a relabelled Run into AI>HUM with the same Run_Id and Timestamp", () => {
    expect(effectiveProvenance(ai("r2", T2), runs)).toEqual({
      origin: "AI>HUM",
      runId: "r2",
      timestamp: T2,
    });
  });

  it("leaves AI under an unrelabelled or unknown Run, and non-AI origins, unchanged", () => {
    const p1 = ai("r1");
    const p9 = ai("r9");
    const h = hum();
    expect(effectiveProvenance(p1, runs)).toBe(p1);
    expect(effectiveProvenance(p9, runs)).toBe(p9);
    expect(effectiveProvenance(h, runs)).toBe(h);
  });
});

describe("spliceSpans insert _Requirements: 4.1, 4.2, 4.3, 4.11, 4.12_", () => {
  it("splits a non-Mergeable span around the inserted piece", () => {
    const out = spliceSpans([span(0, 6, pst())], 2, 2, span(2, 5, ai("r1", T2)));
    expect(out.spans).toEqual([span(0, 2, pst()), span(2, 5, ai("r1", T2)), span(5, 9, pst())]);
    expect(out.deletedPieces).toEqual([]);
  });

  it("extends a Mergeable span when inserting inside it, keeping its Timestamp", () => {
    const out = spliceSpans([span(0, 6, hum(T1))], 3, 3, span(3, 5, hum(T2)));
    expect(out.spans).toEqual([span(0, 8, hum(T1))]);
  });

  it("merges with a preceding Mergeable span at a boundary, taking its Timestamp", () => {
    const spans = [span(0, 3, hum(T1)), span(3, 6, pst())];
    const out = spliceSpans(spans, 3, 3, span(3, 4, hum(T2)));
    expect(out.spans).toEqual([span(0, 4, hum(T1)), span(4, 7, pst())]);
  });

  it("absorbs a following Mergeable span, which takes the inserted Timestamp", () => {
    const spans = [span(0, 3, pst()), span(3, 6, hum(T1))];
    const out = spliceSpans(spans, 3, 3, span(3, 4, hum(T2)));
    expect(out.spans).toEqual([span(0, 3, pst()), span(3, 7, hum(T2))]);
  });

  it("inserts at 0 and at the end without splitting anything", () => {
    const spans = [span(0, 3, pst())];
    expect(spliceSpans(spans, 0, 0, span(0, 2, hum())).spans).toEqual([
      span(0, 2, hum()),
      span(2, 5, pst()),
    ]);
    expect(spliceSpans(spans, 3, 3, span(3, 5, hum())).spans).toEqual([
      span(0, 3, pst()),
      span(3, 5, hum()),
    ]);
  });

  it("inserts into an empty span list", () => {
    expect(spliceSpans([], 0, 0, span(0, 4, pst())).spans).toEqual([span(0, 4, pst())]);
  });
});

describe("spliceSpans delete _Requirements: 4.4, 4.5, 4.11_", () => {
  const spans = [span(0, 4, hum()), span(4, 8, ai("r1")), span(8, 12, pst())];

  it("drops covered spans, cuts partial ones, shifts the right, and returns deleted pieces", () => {
    const out = spliceSpans(spans, 2, 10, null);
    expect(out.spans).toEqual([span(0, 2, hum()), span(2, 4, pst())]);
    expect(out.deletedPieces).toEqual([
      span(2, 4, hum()),
      span(4, 8, ai("r1")),
      span(8, 10, pst()),
    ]);
  });

  it("returns the deleted piece when the deletion lies inside one span", () => {
    const out = spliceSpans(spans, 5, 7, null);
    expect(out.spans).toEqual([span(0, 4, hum()), span(4, 6, ai("r1")), span(6, 10, pst())]);
    expect(out.deletedPieces).toEqual([span(5, 7, ai("r1"))]);
  });

  it("merges the seam when the deletion brings Mergeable spans together", () => {
    const mixed = [span(0, 3, hum(T1)), span(3, 5, pst()), span(5, 9, hum(T2))];
    const out = spliceSpans(mixed, 3, 5, null);
    expect(out.spans).toEqual([span(0, 7, hum(T1))]);
    expect(out.deletedPieces).toEqual([span(3, 5, pst())]);
  });

  it("deleting everything leaves zero spans", () => {
    const out = spliceSpans(spans, 0, 12, null);
    expect(out.spans).toEqual([]);
    expect(out.deletedPieces).toEqual(spans);
  });
});

describe("spliceSpans replace _Requirements: 4.11, 6.11_", () => {
  it("replaces across spans and merges the new piece at both seams", () => {
    const spans = [span(0, 4, hum(T1)), span(4, 8, pst()), span(8, 12, hum(T2))];
    const out = spliceSpans(spans, 2, 10, span(2, 3, hum(T2)));
    expect(out.spans).toEqual([span(0, 5, hum(T1))]);
    expect(out.deletedPieces).toEqual([
      span(2, 4, hum(T1)),
      span(4, 8, pst()),
      span(8, 10, hum(T2)),
    ]);
  });

  it("an AI>HUM effective piece merges with AI>HUM spans of the same Run, not with AI", () => {
    const relabelled = effectiveProvenance(ai("r1", T2), [run("r1", true)]);
    const ahum: Provenance = { origin: "AI>HUM", runId: "r1", timestamp: T1 };
    const out = spliceSpans([span(0, 4, ahum)], 2, 2, span(2, 3, relabelled));
    expect(out.spans).toEqual([span(0, 5, ahum)]);
    const plain = spliceSpans([span(0, 4, ai("r1"))], 2, 2, span(2, 3, relabelled));
    expect(plain.spans).toHaveLength(3);
  });
});
