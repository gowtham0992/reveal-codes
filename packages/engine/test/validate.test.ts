import { describe, expect, it } from "vitest";
import { structuralEqual } from "../src/equal";
import type { Provenance } from "../src/types";
import { checkProvenance, firstUnpairedSurrogate, isTimestamp } from "../src/validate";

const TS = "2024-02-29T00:00:00Z";

/** Builds a deliberately mis-shaped record to exercise the runtime check. */
const shape = (fields: Record<string, unknown>): Provenance =>
  ({ timestamp: TS, ...fields }) as unknown as Provenance;

describe("isTimestamp _Requirements: 2.7_", () => {
  it("accepts 29 February in a leap year", () => {
    expect(isTimestamp("2024-02-29T00:00:00Z")).toBe(true);
  });

  it("rejects 29 February in a non-leap year", () => {
    expect(isTimestamp("2023-02-29T00:00:00Z")).toBe(false);
  });

  it("rejects a timestamp with no trailing Z", () => {
    expect(isTimestamp("2024-02-29T00:00:00")).toBe(false);
  });

  it("accepts fractional seconds and rejects non-string values", () => {
    expect(isTimestamp("2024-12-31T23:59:59.123Z")).toBe(true);
    expect(isTimestamp(1709164800000)).toBe(false);
  });
});

describe("firstUnpairedSurrogate _Requirements: 2.6_", () => {
  it("returns null for text with only paired surrogates", () => {
    expect(firstUnpairedSurrogate("a\u{1F600}b")).toBeNull();
  });

  it("returns the index of a lone high surrogate", () => {
    expect(firstUnpairedSurrogate("ab\uD83Dc")).toBe(2);
    expect(firstUnpairedSurrogate("abc\uD83D")).toBe(3);
  });

  it("returns the index of a lone low surrogate", () => {
    expect(firstUnpairedSurrogate("a\uDE00bc")).toBe(1);
  });

  it("returns the first of several unpaired surrogates, after a valid pair", () => {
    expect(firstUnpairedSurrogate("\u{1F600}x\uDE00\uD83D")).toBe(3);
  });
});

describe("checkProvenance shape rule _Requirements: 2.5_", () => {
  it("accepts HUM and PST with no runId key", () => {
    const hum: Provenance = { origin: "HUM", timestamp: TS };
    const pst: Provenance = { origin: "PST", timestamp: TS };
    expect(checkProvenance(hum)).toEqual({ ok: true, value: hum });
    expect(checkProvenance(pst)).toEqual({ ok: true, value: pst });
  });

  it("accepts AI and AI>HUM with a non-empty runId", () => {
    const ai: Provenance = { origin: "AI", runId: "r7", timestamp: TS };
    const edited: Provenance = { origin: "AI>HUM", runId: "r7", timestamp: TS };
    expect(checkProvenance(ai)).toEqual({ ok: true, value: ai });
    expect(checkProvenance(edited)).toEqual({ ok: true, value: edited });
  });

  it("rejects AI and AI>HUM with an absent or empty runId", () => {
    expect(checkProvenance(shape({ origin: "AI" }))).toEqual({
      ok: false,
      error: { kind: "invalid_provenance", field: "runId", value: undefined },
    });
    expect(checkProvenance(shape({ origin: "AI>HUM", runId: "" }))).toEqual({
      ok: false,
      error: { kind: "invalid_provenance", field: "runId", value: "" },
    });
  });

  it("rejects HUM and PST carrying a runId key, even one holding undefined", () => {
    expect(checkProvenance(shape({ origin: "HUM", runId: "r1" }))).toEqual({
      ok: false,
      error: { kind: "invalid_provenance", field: "runId", value: "r1" },
    });
    const result = checkProvenance(shape({ origin: "PST", runId: undefined }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.field).toBe("runId");
  });

  it("rejects an Origin outside the four Origins", () => {
    expect(checkProvenance(shape({ origin: "BOT" }))).toEqual({
      ok: false,
      error: { kind: "invalid_provenance", field: "origin", value: "BOT" },
    });
  });
});

describe("structuralEqual _Requirements: 1.4_", () => {
  it("ignores object key order", () => {
    expect(structuralEqual({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })).toBe(true);
  });

  it("respects array element order", () => {
    expect(structuralEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(structuralEqual([1, 2, 3], [3, 2, 1])).toBe(false);
    expect(structuralEqual({ xs: [{ a: 1 }, { b: 2 }] }, { xs: [{ b: 2 }, { a: 1 }] })).toBe(false);
  });

  it("distinguishes a key holding undefined from a missing key", () => {
    expect(structuralEqual({ a: 1, b: undefined }, { a: 1 })).toBe(false);
  });

  it("distinguishes arrays from objects and differing primitives", () => {
    expect(structuralEqual([1], { 0: 1 })).toBe(false);
    expect(structuralEqual("1", 1)).toBe(false);
  });
});
