import type { VerificationResult } from "@reveal-codes/engine";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { citationDiffers } from "../src/findings.js";
import { runs } from "./support/fc.js";

// A small id pool makes equal cluster ids common, so both sides of the rule are exercised.
const arbClusterId = fc.constantFrom("1", "2", "145875");
const arbName = fc.string({ minLength: 1, maxLength: 20 });

const arbComparable: fc.Arbitrary<VerificationResult> = fc.oneof(
  arbClusterId.map((clusterId): VerificationResult => ({ status: "verified", clusterId })),
  fc
    .record({
      clusterId: arbClusterId,
      foundName: arbName,
      foundYear: fc.integer({ min: 1000, max: 9999 }),
    })
    .map((r): VerificationResult => ({ status: "wrong_case", ...r })),
  fc
    .record({ clusterId: arbClusterId, foundName: arbName })
    .map((r): VerificationResult => ({ status: "wrong_case", ...r })),
  fc
    .array(arbClusterId, { minLength: 2, maxLength: 4 })
    .map((candidates): VerificationResult => ({ status: "ambiguous", candidates })),
  fc.constant<VerificationResult>({ status: "not_found" }),
);

function clusterOf(result: VerificationResult): string | null {
  return result.status === "verified" || result.status === "wrong_case" ? result.clusterId : null;
}

function expected(old: VerificationResult, now: VerificationResult): boolean {
  if (old.status !== now.status) return true;
  if (old.status === "verified" || old.status === "wrong_case") {
    return clusterOf(old) !== clusterOf(now);
  }
  return false;
}

describe("Property 15: Sentinel finding rule _Requirements: 9.2, 9.3, 9.4, 9.5_", () => {
  // Feature: case-match, Property 15: Sentinel finding rule
  // Property 15
  it("differs iff the status differs or the cluster id of a verified or wrong_case pair differs", () => {
    fc.assert(
      fc.property(arbComparable, arbComparable, (old, now) => {
        expect(citationDiffers(old, now)).toBe(expected(old, now));
      }),
      { numRuns: runs(process.env) },
    );
  });
});
