import fc from "fast-check";
import { describe, expect, it } from "vitest";
import * as api from "../src/index";
import {
  API_NAMES,
  arbApiCall,
  arbApiCallTo,
  arbDocument,
  type ApiName,
} from "../src/testing/arbitraries";

const sample = <T>(arb: fc.Arbitrary<T>, numRuns: number): T[] =>
  fc.sample(arb, { numRuns, seed: 7 });

describe("arbApiCall", () => {
  it("covers exactly the exported functions of the public API", () => {
    const exported = Object.entries(api)
      .filter(([, v]) => typeof v === "function")
      .map(([k]) => k)
      .filter((k) => k !== "ok" && k !== "err");
    expect([...API_NAMES].sort()).toEqual(exported.sort());
  });

  it("reaches every function name from arbApiCall", () => {
    const seen = new Set<ApiName>();
    for (const call of sample(arbDocument.chain(arbApiCall), 600)) seen.add(call.name);
    expect([...seen].sort()).toEqual([...API_NAMES].sort());
  });

  it("every function's calls execute without throwing and are repeatable", () => {
    for (const name of API_NAMES) {
      const calls = sample(
        arbDocument.chain((d) => arbApiCallTo(name, d)),
        25,
      );
      for (const call of calls) {
        expect(call.name).toBe(name);
        expect(call.run(call.args)).toEqual(call.run(call.args));
      }
    }
  });
});
