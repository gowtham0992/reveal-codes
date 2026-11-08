import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { checkQuote } from "../src/quote";
import { normaliseQuote } from "../src/normalise";
import { splitSegments } from "../src/segments";
import {
  arbAdversarialPair,
  arbAlteredQuote,
  arbEllipsisJoin,
  arbLiftedSegments,
  arbTypeset,
  typeset,
} from "./support/arb-verifier";
import { runs } from "./support/fc";
import { modelPrefixLength } from "./support/prefix-model";

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

// Property 9
// Feature: citation-verifier, Property 9: An altered quotation mismatches, and prefixLength locates the divergence
type Case9 =
  | { tag: "altered"; opinion: string; altered: string; offset: number }
  | { tag: "adversarial"; opinion: string; quote: string };

const arbCase9: fc.Arbitrary<Case9> = fc.oneof(
  arbAlteredQuote.map((a): Case9 => ({ tag: "altered", ...a })),
  arbAdversarialPair.map((p): Case9 => ({ tag: "adversarial", ...p })),
);

/**
 * The expected mismatch prefixLength: Req 8.8 for a quote with no segment, Req 8.7 for a
 * short single segment, else the A9 model (which knows neither rule).
 */
function expectedPrefix(quote: string, opinion: string): number {
  const segs = splitSegments(normaliseQuote(quote));
  if (segs.length === 0) return 0;
  const only = segs.length === 1 ? (segs[0] as string) : undefined;
  if (only !== undefined && only.length < 12) return 0;
  return modelPrefixLength(quote, opinion);
}

describe("Property 9: altered quotation _Requirements: 8.6, 8.13, 8.15_", () => {
  it("mismatches, and prefixLength locates the divergence", () => {
    fc.assert(
      fc.property(arbCase9, (c) => {
        if (c.tag === "altered") {
          const r = checkQuote(c.opinion, c.altered);
          expect(r.status).toBe("mismatch");
          const n = r.status === "mismatch" ? r.prefixLength : -1;
          expect(n).toBeGreaterThanOrEqual(c.offset);
          expect(n).toBeLessThan(c.altered.length);
          return;
        }
        const r = checkQuote(c.opinion, c.quote);
        if (r.status !== "mismatch") return;
        expect(r.prefixLength).toBe(expectedPrefix(c.quote, c.opinion));
      }),
      { numRuns: runs() },
    );
  });

  // Shrunk counterexample of Property 9 (seed -328581092, found at 500 runs): the quote ",."
  // is empty after Req 8.3 tail trimming, so it has no segment and Req 8.8 gives 0. The
  // brute-force model skips tail trimming for prefixes and answered 1. The code was right.
  it("counterexample: quote ',.' has no segment, so prefixLength is 0 (Req 8.8)", () => {
    expect(normaliseQuote(",.")).toBe("");
    expect(checkQuote(", a", ",.")).toEqual({ status: "mismatch", prefixLength: 0 });
  });

  // Shrunk counterexample of Property 9: the untracked path probed only cuts before a space,
  // so it missed the cut just after a space (n = 2, "a ") and returned 1 where the definition
  // gives 2. The quote is not NFC (the jamo pair composes), so tracking is abandoned (L3).
  it("counterexample: untracked quote 'a a…가 a' over 'a' has prefixLength 2", () => {
    const quote = "a a…\u1100\u1161 a";
    expect(modelPrefixLength(quote, "a")).toBe(2);
    expect(checkQuote("a", quote)).toEqual({ status: "mismatch", prefixLength: 2 });
  });
});
