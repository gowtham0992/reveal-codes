import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  collapseWhitespace,
  foldEllipses,
  normalise,
  normaliseQuote,
  removeBracketPairs,
  straightenDashes,
  straightenQuotes,
  trimTail,
} from "../src/normalise";
import { trackQuote } from "../src/track";
import { arbAnyString } from "../../engine/src/testing/arb-text";
import { arbNormalisable } from "./support/arb-verifier";
import { runs } from "./support/fc";

const arbInput: fc.Arbitrary<string> = fc.oneof(
  { weight: 4, arbitrary: arbNormalisable },
  { weight: 1, arbitrary: arbAnyString },
);

const steps: ReadonlyArray<readonly [string, (s: string) => string]> = [
  ["straightenQuotes", straightenQuotes],
  ["straightenDashes", straightenDashes],
  ["removeBracketPairs", removeBracketPairs],
  ["foldEllipses", foldEllipses],
  ["collapseWhitespace", collapseWhitespace],
];

// Property 7
// Feature: citation-verifier, Property 7: The Normalisation_Pipeline is idempotent and never lengthens beyond NFC
describe("Property 7: normalisation _Requirements: 8.10, 8.11_", () => {
  it("is idempotent, never lengthens beyond NFC, and tracked text agrees with the string path", () => {
    fc.assert(
      fc.property(arbInput, (s) => {
        const n = normalise(s);
        expect(normalise(n)).toBe(n);
        const q = normaliseQuote(s);
        expect(normaliseQuote(q)).toBe(q);
        for (const [name, step] of steps) {
          expect(step(s).length, name).toBeLessThanOrEqual(s.length);
        }
        expect(n.length).toBeLessThanOrEqual(s.normalize("NFC").length);
        const tracked = trackQuote(s);
        if (tracked !== null) expect(trimTail(tracked.v)).toBe(q);
      }),
      { numRuns: runs() },
    );
  });
});
