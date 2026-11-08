import { describe, expect, it } from "vitest";
import { mapChunk, parseLookupBody } from "../src/map-status";

const NOW = Date.parse("2026-11-02T12:00:00.000Z");
const LINES = ["1 U.S. 1"] as const;

function map(body: unknown, lines: readonly string[] = LINES, retryAfter: string | null = null) {
  return mapChunk(lines, parseLookupBody(body), retryAfter, NOW);
}
const one = (entry: unknown, retryAfter: string | null = null) =>
  map([entry], LINES, retryAfter).get("1 U.S. 1");
const cl = (...ids: unknown[]) => ids.map((id) => ({ id }));

describe("mapChunk per row of A5", () => {
  it("200 with one cluster is verified, with the id as a string", () => {
    expect(one({ status: 200, clusters: cl(108713) })).toEqual({
      status: "verified",
      clusterId: "108713",
    });
    expect(one({ status: 200, clusters: cl("7") })).toEqual({ status: "verified", clusterId: "7" });
  });
  it("200 with a repeated id is still one distinct cluster", () => {
    expect(one({ status: 200, clusters: cl(5, 5) })).toEqual({
      status: "verified",
      clusterId: "5",
    });
  });
  it("200 with two or more clusters is ambiguous in response order", () => {
    expect(one({ status: 200, clusters: cl(9, 3) })).toEqual({
      status: "ambiguous",
      candidates: ["9", "3"],
    });
  });
  it("200 with no usable cluster is unchecked", () => {
    expect(one({ status: 200, clusters: [] })).toEqual({ status: "unchecked" });
    expect(one({ status: 200, clusters: cl(0, -1, 1.5, "01", "x", null) })).toEqual({
      status: "unchecked",
    });
    expect(one({ status: 200 })).toEqual({ status: "unchecked" });
  });
  it("300 with two or more clusters is ambiguous; fewer is unchecked", () => {
    expect(one({ status: 300, clusters: cl(1, 2, 2, 3) })).toEqual({
      status: "ambiguous",
      candidates: ["1", "2", "3"],
    });
    expect(one({ status: 300, clusters: cl(1, 1) })).toEqual({ status: "unchecked" });
  });
  it("404 is not_found with no reason; 400 is unknown_reporter", () => {
    expect(one({ status: 404 })).toEqual({ status: "not_found" });
    expect(one({ status: 400 })).toEqual({ status: "not_found", reason: "unknown_reporter" });
  });
  it("429 takes waitUntil from the entry, accepting both spellings", () => {
    const w = "2026-11-02T12:05:00.000Z";
    expect(one({ status: 429, wait_until: w })).toEqual({ status: "unchecked", waitUntil: w });
    expect(one({ status: 429, wait_util: w })).toEqual({ status: "unchecked", waitUntil: w });
  });
  it("429 falls back to Retry-After, then to nothing", () => {
    expect(one({ status: 429 }, "30")).toEqual({
      status: "unchecked",
      waitUntil: "2026-11-02T12:00:30.000Z",
    });
    expect(one({ status: 429, wait_until: "junk" }, "30")).toEqual({
      status: "unchecked",
      waitUntil: "2026-11-02T12:00:30.000Z",
    });
    expect(one({ status: 429 })).toEqual({ status: "unchecked" });
  });
  it("other statuses are unchecked and never verified", () => {
    for (const status of [0, 201, 500, 299, -200]) {
      expect(one({ status, clusters: cl(1) })).toEqual({ status: "unchecked" });
    }
  });
});

describe("mapChunk on malformed input", () => {
  it("a malformed entry is unchecked and does not disturb its neighbours", () => {
    const r = map(
      [{ status: "200", clusters: cl(1) }, 7, null, { status: 404 }],
      ["a", "b", "c", "d"],
    );
    expect([...r.values()]).toEqual([
      { status: "unchecked" },
      { status: "unchecked" },
      { status: "unchecked" },
      { status: "not_found" },
    ]);
  });
  it("maps by position, not by content", () => {
    const r = map([{ status: 404 }, { status: 200, clusters: cl(4) }], ["x", "y"]);
    expect(r.get("x")).toEqual({ status: "not_found" });
    expect(r.get("y")).toEqual({ status: "verified", clusterId: "4" });
  });
  it("a wrong-length array makes every line unchecked with no waitUntil", () => {
    const r = map([{ status: 200, clusters: cl(1) }], ["a", "b"]);
    expect([...r.values()]).toEqual([{ status: "unchecked" }, { status: "unchecked" }]);
    const long = map([{ status: 429, wait_until: "2026-11-02T12:05:00Z" }, { status: 404 }], ["a"]);
    expect(long.get("a")).toEqual({ status: "unchecked" });
  });
  it("a non-array body makes every line unchecked", () => {
    for (const body of [{}, "x", null, 5, { 0: { status: 200 } }]) {
      expect(map(body).get("1 U.S. 1")).toEqual({ status: "unchecked" });
    }
    expect(parseLookupBody({ status: 200 }).ok).toBe(false);
  });
  it("an empty array for no lines is fine and for one line is a count mismatch", () => {
    expect(map([], []).size).toBe(0);
    expect(map([]).get("1 U.S. 1")).toEqual({ status: "unchecked" });
  });
});
