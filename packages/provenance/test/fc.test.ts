import { describe, expect, it } from "vitest";
import { runs } from "./support/fc.js";

describe("runs (Requirements 16.1, 16.14)", () => {
  const table: ReadonlyArray<readonly [string, Record<string, string | undefined>, number]> = [
    ["unset", {}, 200],
    ["empty FC_NUM_RUNS", { FC_NUM_RUNS: "" }, 200],
    ["zero", { FC_NUM_RUNS: "0" }, 200],
    ["not a number", { FC_NUM_RUNS: "abc" }, 200],
    ["30", { FC_NUM_RUNS: "30" }, 30],
    ["500", { FC_NUM_RUNS: "500" }, 500],
    ["CI set", { CI: "true" }, 500],
    ["CI empty", { CI: "" }, 200],
    ["FC_NUM_RUNS beats CI", { CI: "true", FC_NUM_RUNS: "30" }, 30],
  ];
  it.each(table)("%s", (_name, env, expected) => {
    expect(runs(env)).toBe(expected);
  });
});
