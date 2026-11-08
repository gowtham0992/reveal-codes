import type { VerificationResult } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { combineParallel } from "../src/combine";

const verified = (id: string): VerificationResult => ({ status: "verified", clusterId: id });
const ambiguous = (...c: string[]): VerificationResult => ({ status: "ambiguous", candidates: c });
const notFound = (reason?: string): VerificationResult =>
  reason === undefined ? { status: "not_found" } : { status: "not_found", reason };
const unchecked = (waitUntil?: string): VerificationResult =>
  waitUntil === undefined ? { status: "unchecked" } : { status: "unchecked", waitUntil };

describe("combineParallel (A6)", () => {
  it("row 0: no members is unchecked", () => {
    expect(combineParallel([])).toEqual({ status: "unchecked" });
  });
  it("row 1: one distinct verified id wins and ignores the other members", () => {
    expect(combineParallel([notFound(), verified("7"), unchecked(), verified("7")])).toEqual(
      verified("7"),
    );
    expect(combineParallel([ambiguous("1", "2"), verified("7")])).toEqual(verified("7"));
  });
  it("row 2: distinct verified ids are ambiguous, once each, in first-appearance order", () => {
    expect(combineParallel([verified("9"), notFound(), verified("4"), verified("9")])).toEqual(
      ambiguous("9", "4"),
    );
  });
  it("row 3: without verified, ambiguous candidates merge in order without duplicates", () => {
    expect(combineParallel([ambiguous("1", "2"), unchecked(), ambiguous("2", "3")])).toEqual(
      ambiguous("1", "2", "3"),
    );
  });
  it("row 4: unchecked keeps the latest waitUntil among unchecked members", () => {
    const early = "2026-01-01T00:00:10.000Z";
    const late = "2026-01-01T00:01:00.000Z";
    expect(combineParallel([unchecked(late), notFound(), unchecked(early)])).toEqual(
      unchecked(late),
    );
    expect(combineParallel([unchecked(), unchecked(early)])).toEqual(unchecked(early));
  });
  it("row 4: unchecked with no waitUntil anywhere has none", () => {
    const r = combineParallel([notFound(), unchecked()]);
    expect(r).toEqual({ status: "unchecked" });
    expect("waitUntil" in r).toBe(false);
  });
  it("row 5: all not_found is not_found", () => {
    expect(combineParallel([notFound(), notFound()])).toEqual({ status: "not_found" });
  });
  it("row 5: reason is kept only when every member has the same reason", () => {
    const same = combineParallel([notFound("unknown_reporter"), notFound("unknown_reporter")]);
    expect(same).toEqual(notFound("unknown_reporter"));
    for (const mixed of [
      [notFound("unknown_reporter"), notFound()],
      [notFound("unknown_reporter"), notFound("other")],
    ]) {
      const r = combineParallel(mixed);
      expect(r).toEqual({ status: "not_found" });
      expect("reason" in r).toBe(false);
    }
  });
});
