// Properties of the case-match spec for the verifier. Other verifier property
// tasks (9, 10, 11, 12, 13, 18) append their describe blocks to this file.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  POOL_A_M,
  arbDisjointNames,
  arbNameVariant,
  arbPooledCaseName,
} from "../../engine/src/testing/arb-case-match";
import { namesMatch } from "../src/name-match";
import { runs } from "./support/fc";

type NamePair = Readonly<{ cited: string; found: string; expected: boolean }>;

/** Positive pairs by transformation of a generated name, and negative pairs from disjoint letter pools. */
const arbNamePair: fc.Arbitrary<NamePair> = fc.oneof(
  arbPooledCaseName(POOL_A_M).chain(arbNameVariant),
  arbDisjointNames.map(({ cited, found }) => ({ cited, found, expected: false })),
);

// Feature: case-match, Property 1: names match through case, punctuation, abbreviation and initialism
// Property 1
describe("Property 1: Name matching _Requirements: 4.12_", () => {
  it("matches a name through case, punctuation, abbreviation and initialism, and never across disjoint names", () => {
    fc.assert(
      fc.property(arbNamePair, ({ cited, found, expected }) => {
        const first = namesMatch(cited, [found]);
        expect(first).toBe(expected);
        expect(namesMatch(cited, [found])).toBe(first);
        if (expected) expect(namesMatch(found, [cited])).toBe(true);
      }),
      { numRuns: runs() },
    );
  });
});
