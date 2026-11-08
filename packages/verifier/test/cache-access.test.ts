import { describe, expect, it } from "vitest";
import { cacheGet, cacheSet, isOpinionText, isTerminalResult } from "../src/cache-access";
import type { CacheStore } from "../src/deps";
import { makeDeps } from "./support/make-deps";

const VERIFIED = { status: "verified", clusterId: "42" } as const;

describe("cacheSet/cacheGet _Requirements: 10.1, 10.2, 10.7, 10.13_", () => {
  it("writes with a 24 h expiry and reads it back", async () => {
    const { deps, clock, cache } = makeDeps();
    await cacheSet(deps, "556 U.S. 662", VERIFIED);
    expect(await cacheGet(deps, "556 U.S. 662")).toEqual(VERIFIED);
    clock.advance(86_399_999);
    expect(await cache.get("556 U.S. 662")).toEqual(VERIFIED);
    clock.advance(1);
    expect(await cache.get("556 U.S. 662")).toBeUndefined();
  });

  it("never writes an unchecked result", async () => {
    const { deps } = makeDeps();
    await cacheSet(deps, "k", { status: "unchecked", waitUntil: "2026-01-01T00:00:00.000Z" });
    expect(deps.state.counters.value.writes).toBe(0);
    expect(await cacheGet(deps, "k")).toBeUndefined();
  });

  it("overwrites an expired entry with a new expiry", async () => {
    const { deps, clock } = makeDeps();
    await cacheSet(deps, "k", VERIFIED);
    clock.advance(86_400_000);
    expect(await cacheGet(deps, "k")).toBeUndefined();
    await cacheSet(deps, "k", { status: "not_found" });
    clock.advance(86_399_999);
    expect(await cacheGet(deps, "k")).toEqual({ status: "not_found" });
  });

  it("counts a bad-shape value as a miss", async () => {
    const { deps, cache } = makeDeps();
    const exp = new Date(deps.now().getTime() + 1000).toISOString();
    await cache.set("k", { status: "ambiguous", candidates: ["1"] }, exp);
    expect(await cacheGet(deps, "k")).toBeUndefined();
    expect(deps.state.counters.value).toEqual({ hits: 0, misses: 1, writes: 0 });
  });

  it("treats store rejections as a miss and a failed write as done", async () => {
    const { deps } = makeDeps();
    const broken: CacheStore = {
      get: () => Promise.reject(new Error("get")),
      set: () => Promise.reject(new Error("set")),
      delete: () => Promise.resolve(),
    };
    const d = { ...deps, cache: broken };
    expect(await cacheGet(d, "k")).toBeUndefined();
    await expect(cacheSet(d, "k", VERIFIED)).resolves.toBeUndefined();
    expect(d.state.counters.value).toEqual({ hits: 0, misses: 1, writes: 1 });
  });

  it("accepts a custom guard for opinion text", async () => {
    const { deps } = makeDeps();
    await cacheSet(deps, "opinion:7", "text");
    expect(await cacheGet(deps, "opinion:7", isOpinionText)).toBe("text");
    expect(isOpinionText("")).toBe(false);
  });
});

describe("isTerminalResult", () => {
  it("accepts the three terminal shapes and rejects others", () => {
    expect(isTerminalResult(VERIFIED)).toBe(true);
    expect(isTerminalResult({ status: "ambiguous", candidates: ["1", "2"] })).toBe(true);
    expect(isTerminalResult({ status: "not_found", reason: "unknown_reporter" })).toBe(true);
    expect(isTerminalResult({ status: "verified", clusterId: 42 })).toBe(false);
    expect(isTerminalResult({ status: "not_found", reason: 1 })).toBe(false);
    expect(isTerminalResult({ status: "unchecked" })).toBe(false);
    expect(isTerminalResult(null)).toBe(false);
  });
});
