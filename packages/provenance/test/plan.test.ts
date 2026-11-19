import { describe, expect, it } from "vitest";
import { planHunks } from "../src/core/plan.js";
import { fixedClock } from "./support/clock.js";

const W = "turn 2026-11-19T10:00:00Z";
const clock = fixedClock();

describe("planHunks", () => {
  it("numbers text Hunks in ascending offset order and emits highest offset first", () => {
    const ops = planHunks(
      [
        { from: 10, to: 12, text: "b\n" },
        { from: 0, to: 0, text: "a\n" },
      ],
      "AI",
      W,
      [],
      clock,
    );
    expect(ops.map((o) => o.from)).toEqual([10, 0]);
    expect(ops.map((o) => o.provenance.runId)).toEqual([`${W}.2`, `${W}.1`]);
    expect(ops.every((o) => o.provenance.origin === "AI")).toBe(true);
  });

  it("continues after the highest existing number", () => {
    const ops = planHunks([{ from: 0, to: 0, text: "x\n" }], "AI", W, [1, 3, 2], clock);
    expect(ops[0]?.provenance.runId).toBe(`${W}.4`);
  });

  it("gives a delete-only Hunk no number and keeps the numbers gapless", () => {
    const ops = planHunks(
      [
        { from: 0, to: 4, text: "" },
        { from: 6, to: 6, text: "n\n" },
      ],
      "AI",
      W,
      [],
      clock,
    );
    expect(ops[0]?.provenance.runId).toBe(`${W}.1`);
    expect(ops[1]?.provenance.runId).toBe(`${W}.0`);
  });

  it("gives HUM no run id", () => {
    const [op] = planHunks([{ from: 0, to: 0, text: "x" }], "HUM", W, [], clock);
    expect(op?.provenance).toEqual({ origin: "HUM", timestamp: clock.nowIso() });
  });
});
