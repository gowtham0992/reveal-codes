import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { decodeBaseline, encodeBaseline } from "../src/core/baseline-codec.js";
import { arbBaselineTwoOrders } from "../src/testing/arbitraries.js";
import { runs } from "./support/fc.js";

/** UTF-16 code unit order, written out so the test does not rely on the sort under test. */
function compareUnits(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    const d = a.charCodeAt(i) - b.charCodeAt(i);
    if (d !== 0) return d;
  }
  return a.length - b.length;
}

describe("baseline-codec properties _Requirements: 5.4, 6.3_", () => {
  // Property 8
  it("P8 the baseline file round-trips", () => {
    fc.assert(
      fc.property(arbBaselineTwoOrders, ({ first, second }) => {
        const text = encodeBaseline(first);

        // decode(encode(x)) equals x.
        const decoded = decodeBaseline(text);
        expect(decoded.ok).toBe(true);
        if (decoded.ok) expect(decoded.value).toEqual(first);

        // One entry per line, in UTF-16 code unit order of path.
        const paths = Object.keys(first.files).sort(compareUnits);
        const lines = text.split("\n");
        if (paths.length === 0) {
          expect(lines).toEqual([
            "{",
            '  "version": 1,',
            `  "at": ${JSON.stringify(first.at)},`,
            '  "files": {}',
            "}",
            "",
          ]);
        } else {
          expect(lines.slice(0, 4)).toEqual([
            "{",
            '  "version": 1,',
            `  "at": ${JSON.stringify(first.at)},`,
            '  "files": {',
          ]);
          expect(lines.slice(4 + paths.length)).toEqual(["  }", "}", ""]);
          paths.forEach((path, i) => {
            expect(lines[4 + i]?.startsWith(`    ${JSON.stringify(path)}: {`)).toBe(true);
          });
        }

        // The same set in any insertion order gives the same bytes.
        expect(encodeBaseline(second)).toBe(text);
      }),
      { numRuns: runs(process.env) },
    );
  });
});
