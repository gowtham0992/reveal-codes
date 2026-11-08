import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { chunkLines, MAX_BODY_CHARS, MAX_LINES } from "../src/chunk";
import { arbChunkInput } from "./support/arb-verifier";
import { runs } from "./support/fc";

// Property 4
// Feature: citation-verifier, Property 4: Chunking caps hold and chunks concatenate to the input
describe("Property 4: chunking _Requirements: 7.2, 7.7_", () => {
  it("every chunk obeys the caps and the chunks rebuild the input", () => {
    fc.assert(
      fc.property(arbChunkInput, (lines) => {
        const chunks = chunkLines(lines);
        for (const c of chunks) {
          expect(c.lines.length).toBeGreaterThan(0);
          if (c.oversize) {
            expect(c.lines).toHaveLength(1);
            expect((c.lines[0] ?? "").length).toBeGreaterThan(MAX_BODY_CHARS);
          } else {
            expect(c.lines.length).toBeLessThanOrEqual(MAX_LINES);
            expect(c.lines.join("\n").length).toBeLessThanOrEqual(MAX_BODY_CHARS);
          }
        }
        expect(chunks.flatMap((c) => c.lines)).toEqual(lines);
        // A line is oversize exactly when it alone exceeds the cap.
        const flagged = chunks.filter((c) => c.oversize).flatMap((c) => c.lines);
        expect(flagged).toEqual(lines.filter((l) => l.length > MAX_BODY_CHARS));
      }),
      { numRuns: runs() },
    );
  });
});
