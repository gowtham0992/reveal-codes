import { describe, expect, it } from "vitest";
import {
  checkCoverage,
  isMergeable,
  mergeSeams,
  normaliseSpans,
  originAt,
  runExtents,
} from "../src/spans";
import type { Provenance, Span } from "../src/types";

const T1 = "2024-01-01T00:00:00Z";
const T2 = "2024-01-02T00:00:00Z";

const hum = (timestamp = T1): Provenance => ({ origin: "HUM", timestamp });
const pst = (timestamp = T1): Provenance => ({ origin: "PST", timestamp });
const ai = (runId: string, timestamp = T1): Provenance => ({ origin: "AI", runId, timestamp });
const span = (start: number, end: number, provenance: Provenance): Span => ({
  start,
  end,
  provenance,
});

describe("isMergeable _Requirements: 3.3_", () => {
  it("ignores Timestamps and compares Origin and Run_Id", () => {
    expect(isMergeable(hum(T1), hum(T2))).toBe(true);
    expect(isMergeable(ai("r1"), ai("r1", T2))).toBe(true);
    expect(isMergeable(ai("r1"), ai("r2"))).toBe(false);
    expect(isMergeable(hum(), pst())).toBe(false);
  });
});

describe("checkCoverage _Requirements: 3.1, 3.6_", () => {
  it("accepts a contiguous cover and the empty list for empty text", () => {
    expect(checkCoverage(5, [span(0, 2, hum()), span(2, 5, pst())]).ok).toBe(true);
    expect(checkCoverage(0, []).ok).toBe(true);
  });

  it.each([
    ["empty", 5, [span(0, 2, hum()), span(2, 2, pst()), span(2, 5, hum())], 2],
    ["overlap", 5, [span(0, 3, hum()), span(2, 5, pst())], 2],
    ["unsorted", 5, [span(0, 2, hum()), span(2, 5, pst()), span(1, 2, hum())], 1],
    ["gap", 5, [span(0, 2, hum()), span(3, 5, pst())], 2],
    ["coverage", 5, [span(0, 4, hum())], 4],
    ["coverage", 3, [span(0, 4, hum())], 3],
    ["coverage", 2, [], 0],
  ] as const)("reports %s at the first violating offset", (kind, length, spans, offset) => {
    expect(checkCoverage(length, spans)).toEqual({
      ok: false,
      error: { kind: "invalid_spans", offset, violation: kind },
    });
  });
});

describe("normaliseSpans _Requirements: 3.3, 3.4, 3.5, 3.6, 3.7_", () => {
  it("merges Mergeable runs keeping the lowest-start Timestamp", () => {
    const input = [
      span(0, 2, hum(T2)),
      span(2, 4, hum(T1)),
      span(4, 6, ai("r1")),
      span(6, 7, hum()),
    ];
    expect(normaliseSpans(7, input)).toEqual({
      ok: true,
      value: [span(0, 4, hum(T2)), span(4, 6, ai("r1")), span(6, 7, hum())],
    });
  });

  it("does not merge different Run_Ids, and is idempotent", () => {
    const input = [span(0, 2, ai("r1")), span(2, 4, ai("r2"))];
    const once = normaliseSpans(4, input);
    expect(once).toEqual({ ok: true, value: input });
    if (!once.ok) return;
    expect(normaliseSpans(4, once.value)).toEqual(once);
  });

  it("rejects an invalid list without mutating it", () => {
    const input = [span(0, 2, hum()), span(3, 5, hum())];
    const copy = structuredClone(input);
    expect(normaliseSpans(5, input)).toEqual({
      ok: false,
      error: { kind: "invalid_spans", offset: 2, violation: "gap" },
    });
    expect(input).toEqual(copy);
  });
});

describe("mergeSeams _Requirements: 3.3_", () => {
  it("merges only at listed seams, chaining adjacent ones", () => {
    const input = [span(0, 2, hum(T2)), span(2, 3, hum(T1)), span(3, 5, hum()), span(5, 6, hum())];
    expect(mergeSeams(input, [1, 2])).toEqual([span(0, 5, hum(T2)), span(5, 6, hum())]);
  });

  it("leaves non-Mergeable seams and out-of-range seams alone", () => {
    const input = [span(0, 2, hum()), span(2, 3, pst())];
    expect(mergeSeams(input, [0, 1, 2])).toEqual(input);
  });
});

describe("originAt and runExtents _Requirements: 3.5_", () => {
  const spans = [
    span(0, 2, ai("r1")),
    span(2, 4, hum()),
    span(4, 6, ai("r1")),
    span(6, 8, ai("r2")),
  ];

  it("finds the Origin at a code unit", () => {
    expect(originAt(spans, 0)).toBe("AI");
    expect(originAt(spans, 3)).toBe("HUM");
    expect(originAt(spans, 7)).toBe("AI");
    expect(originAt(spans, 8)).toBeNull();
  });

  it("spans each Run from its first span's start to its last span's end", () => {
    expect([...runExtents(spans)]).toEqual([
      ["r1", [0, 6]],
      ["r2", [6, 8]],
    ]);
  });
});
