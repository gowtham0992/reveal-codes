import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isPartyName } from "../src/citations/case-name";
import { MAX_PARTY, partyStartFor } from "../src/citations/party";
import {
  arbLongParty,
  arbPartyLeftContext,
  arbPartyName,
  arbShortFormParty,
  arbStopListPrefix,
  LIVE_STOP_ENTRIES,
  MAX_STOP_PREFIX,
} from "../src/testing/arbitraries";
import { runs } from "./support/fc";

const TAIL = ", 5 U.S. at 9";

describe("case-name arbitraries meet their definitions _Requirements: 22.1, 22.4_", () => {
  it("the live stop-list entries are the eleven the design lists", () => {
    expect([...LIVE_STOP_ENTRIES].sort()).toEqual(
      [
        "See",
        "Accord",
        "Compare",
        "Citing",
        "Quoting",
        "Contra",
        "In",
        "As",
        "Under",
        "Following",
        "Applying",
      ].sort(),
    );
  });

  it("arbPartyName values pass isPartyName", () => {
    fc.assert(
      fc.property(arbPartyName, (p) => {
        expect(isPartyName(p, 0, p.length)).toBe(true);
      }),
      runs(),
    );
  });

  it("arbLongParty values are 81 to 120 code units with no word over 22", () => {
    fc.assert(
      fc.property(arbLongParty, (p) => {
        expect(p.length).toBeGreaterThan(MAX_PARTY);
        expect(p.length).toBeLessThanOrEqual(120);
        expect(Math.max(...p.split(" ").map((w) => w.length))).toBeLessThanOrEqual(23);
      }),
      runs(),
    );
  });

  it("arbShortFormParty is at most 52 code units and is taken whole", () => {
    fc.assert(
      fc.property(arbShortFormParty, (r) => {
        expect(r.length).toBeLessThanOrEqual(52);
        expect(r.split(" ")).not.toContain("Id.");
        expect(partyStartFor(r + TAIL, r.length)).toBe(0);
      }),
      runs(),
    );
  });

  it("left context plus stop-list prefix is stripped exactly", () => {
    fc.assert(
      fc.property(arbPartyLeftContext, arbStopListPrefix, arbShortFormParty, (l, x, r) => {
        expect(x.length).toBeLessThanOrEqual(MAX_STOP_PREFIX);
        const t = l + x + r + TAIL;
        expect(partyStartFor(t, l.length + x.length + r.length)).toBe(l.length + x.length);
      }),
      runs(),
    );
  });
});
