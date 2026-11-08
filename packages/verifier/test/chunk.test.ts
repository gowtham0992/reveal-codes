import { describe, expect, it } from "vitest";
import { chunkLines } from "../src/chunk";

const lines = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => `${String(i + 1)} U.S. 1`);

describe("chunkLines", () => {
  it("returns no chunks for no lines", () => {
    expect(chunkLines([])).toEqual([]);
  });
  it("caps a chunk at 60 lines", () => {
    const c = chunkLines(lines(61));
    expect(c.map((x) => x.lines.length)).toEqual([60, 1]);
    expect(c.every((x) => !x.oversize)).toBe(true);
  });
  it("caps the joined body at 64 000 characters", () => {
    const a = "a".repeat(40_000);
    const b = "b".repeat(24_000); // 40 000 + 1 + 24 000 = 64 001
    const fit = "b".repeat(23_999); // exactly 64 000
    expect(chunkLines([a, b]).map((x) => x.lines.length)).toEqual([1, 1]);
    expect(chunkLines([a, fit]).map((x) => x.lines.length)).toEqual([2]);
  });
  it("puts an oversize line alone and keeps order", () => {
    const big = "x".repeat(64_001);
    const c = chunkLines(["1 U.S. 1", big, "2 U.S. 2"]);
    expect(c).toEqual([
      { lines: ["1 U.S. 1"], oversize: false },
      { lines: [big], oversize: true },
      { lines: ["2 U.S. 2"], oversize: false },
    ]);
  });
  it("a line of exactly 64 000 characters is not oversize", () => {
    const edge = "y".repeat(64_000);
    expect(chunkLines([edge])).toEqual([{ lines: [edge], oversize: false }]);
  });
});
