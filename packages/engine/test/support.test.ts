import fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";
import { runs } from "./support/fc";

const original = process.env["FC_NUM_RUNS"];

afterEach(() => {
  if (original === undefined) delete process.env["FC_NUM_RUNS"];
  else process.env["FC_NUM_RUNS"] = original;
});

describe("test support runs() _Requirements: 22.3_", () => {
  it("defaults to 200 runs when FC_NUM_RUNS is unset", () => {
    delete process.env["FC_NUM_RUNS"];
    expect(runs()).toEqual({ numRuns: 200 });
  });

  it("reads FC_NUM_RUNS, as set to 500 by pnpm test:pbt", () => {
    process.env["FC_NUM_RUNS"] = "500";
    expect(runs()).toEqual({ numRuns: 500 });
  });
});

describe("failure reporting and replay _Requirements: 22.3_", () => {
  const failing = fc.property(fc.integer(), (n) => n < 1000);

  it("reports seed and path, and replaying them gives the same counterexample", () => {
    const first = fc.check(failing, runs());
    expect(first.failed).toBe(true);
    const report = fc.defaultReportMessage(first) ?? "";
    expect(report).toContain(`seed: ${String(first.seed)}`);
    expect(report).toContain(`path: "${first.counterexamplePath ?? ""}"`);

    const replay = fc.check(failing, {
      ...runs(),
      seed: first.seed,
      path: first.counterexamplePath ?? "",
    });
    expect(replay.counterexample).toEqual(first.counterexample);
    expect(first.counterexample).toEqual([1000]);
  });
});
