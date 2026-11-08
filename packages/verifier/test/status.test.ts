import { describe, expect, it } from "vitest";
import { cacheGet, cacheSet } from "../src/cache-access";
import { makeDeps } from "./support/make-deps";
import { verifierStatus } from "../src/status";

describe("verifierStatus _Requirements: 10.13, 10.14_", () => {
  it("starts full with zero counters", () => {
    const { deps } = makeDeps();
    expect(verifierStatus(deps)).toEqual({
      bucket: { available: 60, capacity: 60 },
      counters: { hits: 0, misses: 0, writes: 0 },
    });
  });

  it("counts a scripted sequence of gets and sets", async () => {
    const { deps } = makeDeps();
    await cacheGet(deps, "a"); // miss
    await cacheSet(deps, "a", { status: "not_found" }); // write
    await cacheGet(deps, "a"); // hit
    await cacheGet(deps, "a"); // hit
    await cacheSet(deps, "opinion:1", "text"); // write
    expect(verifierStatus(deps).counters).toEqual({ hits: 2, misses: 1, writes: 2 });
  });

  it("computes refilled tokens from Deps.now without storing them", () => {
    const { deps, clock } = makeDeps();
    deps.state.bucket.value = { ...deps.state.bucket.value, tokens: 10, lastMs: clock.nowMs() };
    expect(verifierStatus(deps).bucket.available).toBe(10);
    clock.advance(5_000);
    expect(verifierStatus(deps).bucket.available).toBe(15);
    expect(deps.state.bucket.value.tokens).toBe(10);
    clock.advance(600_000);
    expect(verifierStatus(deps).bucket.available).toBe(60);
  });
});
