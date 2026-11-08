import { describe, expect, it } from "vitest";
import { createMemoryCacheStore } from "../src/cache-memory";
import { createManualClock } from "./support/manual-clock";

describe("createMemoryCacheStore _Requirements: 10.3, 10.11_", () => {
  it("returns the value strictly before expiry and misses at and after it", async () => {
    const clock = createManualClock(1_000);
    const store = createMemoryCacheStore({ now: clock.now });
    await store.set("k", { v: 1 }, new Date(2_000).toISOString());
    expect(await store.get("k")).toEqual({ v: 1 });
    clock.advance(999);
    expect(await store.get("k")).toEqual({ v: 1 });
    clock.advance(1);
    expect(await store.get("k")).toBeUndefined();
    clock.advance(1);
    expect(await store.get("k")).toBeUndefined();
  });

  it("deletes an entry and ignores keys it never saw", async () => {
    const store = createMemoryCacheStore({ now: createManualClock(0).now });
    await store.set("a", 1, new Date(10_000).toISOString());
    await store.set("b", 2, new Date(10_000).toISOString());
    await store.delete("a");
    expect(await store.get("a")).toBeUndefined();
    expect(await store.get("b")).toBe(2);
    expect(await store.get("c")).toBeUndefined();
  });

  it("overwrites an expired entry with a new expiry", async () => {
    const clock = createManualClock(0);
    const store = createMemoryCacheStore({ now: clock.now });
    await store.set("k", "old", new Date(5).toISOString());
    clock.advance(10);
    await store.set("k", "new", new Date(100).toISOString());
    expect(await store.get("k")).toBe("new");
  });
});
