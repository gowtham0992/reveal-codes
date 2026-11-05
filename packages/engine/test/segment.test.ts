import { describe, expect, it } from "vitest";
import { segmentWith } from "../src/segment";
import type { Origin, Provenance, Span } from "../src/types";

const T = "2024-01-01T00:00:00Z";
const prov = (origin: Origin): Provenance =>
  origin === "AI" || origin === "AI>HUM"
    ? { origin, runId: "r1", timestamp: T }
    : { origin, timestamp: T };
const span = (start: number, end: number, origin: Origin): Span => ({
  start,
  end,
  provenance: prov(origin),
});
const all = (text: string, origin: Origin = "HUM"): Span[] =>
  text.length === 0 ? [] : [span(0, text.length, origin)];

describe("segmentWith _Requirements: 8.1, 8.2, 8.4, 8.7, 8.9_", () => {
  it("returns zero Sentences for the empty text", () => {
    expect(segmentWith("", [], [])).toEqual({ ok: true, value: [] });
  });

  it("returns one Sentence when there is no boundary", () => {
    const text = "no terminator here  ";
    expect(segmentWith(text, all(text), [])).toEqual({
      ok: true,
      value: [{ start: 0, end: text.length, dominantOrigin: "HUM", origins: ["HUM"] }],
    });
  });

  it("gives whitespace to the preceding Sentence and tiles the text", () => {
    const text = "One.  Two? Three";
    const result = segmentWith(text, all(text, "PST"), []);
    expect(result.ok && result.value.map((s) => [s.start, s.end])).toEqual([
      [0, 6],
      [6, 11],
      [11, 16],
    ]);
  });

  it("places no boundary inside a citation range", () => {
    const text = "See A. B. here. Next";
    const result = segmentWith(text, all(text), [{ start: 4, end: 14 }]);
    expect(result.ok && result.value.map((s) => s.start)).toEqual([0, 16]);
  });

  it("computes the dominant origin and the origin set in fixed order", () => {
    // "Aaaa. Bbbbbbb." : sentence 1 is [0, 6), sentence 2 is [6, 14).
    const text = "Aaaa. Bbbbbbb.";
    const spans = [span(0, 2, "AI"), span(2, 4, "HUM"), span(4, 9, "PST"), span(9, 14, "HUM")];
    const result = segmentWith(text, spans, []);
    expect(result).toEqual({
      ok: true,
      value: [
        // AI 2, HUM 2, PST 2: tie goes to the earliest-starting span (AI).
        { start: 0, end: 6, dominantOrigin: "AI", origins: ["HUM", "PST", "AI"] },
        // PST 3, HUM 5.
        { start: 6, end: 14, dominantOrigin: "HUM", origins: ["HUM", "PST"] },
      ],
    });
  });

  it("sums code units across several spans of one origin", () => {
    const text = "ab cd ef.";
    const spans = [span(0, 2, "HUM"), span(2, 5, "AI"), span(5, 9, "HUM")];
    const result = segmentWith(text, spans, []);
    expect(result.ok && result.value[0]?.dominantOrigin).toBe("HUM");
  });

  it("returns invalid_spans when coverage fails, before segmenting", () => {
    const text = "One. Two.";
    const result = segmentWith(text, [span(0, 4, "HUM")], []);
    expect(result).toEqual({
      ok: false,
      error: { kind: "invalid_spans", offset: 4, violation: "coverage" },
    });
    expect(segmentWith("", [span(0, 1, "HUM")], []).ok).toBe(false);
  });
});
