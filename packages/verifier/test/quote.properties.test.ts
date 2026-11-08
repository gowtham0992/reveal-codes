import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { checkQuote } from "../src/quote";
import { arbEllipsisJoin, arbLiftedSegments, arbTypeset, typeset } from "./support/arb-verifier";
import { runs } from "./support/fc";

// Property 8
// Feature: citation-verifier, Property 8: A quotation lifted from an opinion matches however it is typeset
describe("Property 8: lifted quotation _Requirements: 8.4, 8.5, 8.12, 8.14_", () => {
  it("matches however the lifted segments are joined and typeset", () => {
    fc.assert(
      fc.property(arbLiftedSegments, arbEllipsisJoin, arbTypeset, (lifted, join, set) => {
        const quote = typeset(join(lifted.segments), set);
        expect(checkQuote(lifted.text, quote)).toEqual({ status: "match" });
      }),
      { numRuns: runs() },
    );
  });
});
