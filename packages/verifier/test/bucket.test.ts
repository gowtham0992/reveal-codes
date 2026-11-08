import { describe, expect, it } from "vitest";
import { acquire, availableTokens, initialBucket, refill, take, waitFor } from "../src/bucket";
import { makeDeps } from "./support/make-deps";

describe("refill", () => {
  it("keeps partial milliseconds (999 then 1)", () => {
    const empty = { ...initialBucket(0), tokens: 0 };
    const a = refill(empty, 999);
    expect(a.tokens).toBe(0);
    expect(a.partialMs).toBe(999);
    const b = refill(a, 1000);
    expect(b.tokens).toBe(1);
    expect(b.partialMs).toBe(0);
  });

  it("caps at 60 and drops partial time at the cap", () => {
    const b = refill({ ...initialBucket(0), tokens: 59 }, 5500);
    expect(b.tokens).toBe(60);
    expect(b.partialMs).toBe(0);
  });

  it("gives no credit for a backwards clock step and re-anchors", () => {
    const empty = { ...initialBucket(10_000), tokens: 0 };
    const back = refill(empty, 4000);
    expect(back.tokens).toBe(0);
    expect(back.lastMs).toBe(4000);
    expect(refill(back, 6000).tokens).toBe(2);
  });
});

describe("waitFor and take", () => {
  it("waits shortfall * 1000 minus retained partial ms", () => {
    const b = refill({ ...initialBucket(0), tokens: 0 }, 400);
    const full = { ...b, tokens: 55 };
    expect(waitFor(full, 60, 400)).toBe(5 * 1000 - 400);
  });

  it("waits for the sliding window when the bucket alone would allow it", () => {
    let b = take(initialBucket(0), 60, 0);
    b = refill(b, 30_000);
    expect(b.tokens).toBe(30);
    expect(waitFor(b, 30, 30_000)).toBe(30_000);
  });

  it("treats an entry sent exactly 60 000 ms ago as outside the window", () => {
    const b = refill(take(initialBucket(0), 60, 0), 60_000);
    expect(waitFor(b, 60, 60_000)).toBe(0);
  });

  it("reports available tokens without storing anything", () => {
    const b = { ...initialBucket(0), tokens: 10 };
    expect(availableTokens(b, 5000)).toBe(15);
    expect(b.tokens).toBe(10);
  });
});

describe("acquire", () => {
  it("deducts without sleeping when tokens are available", async () => {
    const t = makeDeps();
    expect(await acquire(t.deps, 20)).toBe(true);
    expect(t.clock.sleeps).toEqual([]);
    expect(t.deps.state.bucket.value.tokens).toBe(40);
  });

  it("sleeps once for the shortfall, then deducts", async () => {
    const t = makeDeps();
    // Empty bucket with an empty Window_Log, so only the bucket wait applies.
    t.deps.state.bucket.value = { ...initialBucket(t.clock.nowMs()), tokens: 0 };
    t.clock.advance(400);
    expect(await acquire(t.deps, 5)).toBe(true);
    expect(t.clock.sleeps).toEqual([5 * 1000 - 400]);
  });

  it("sleeps until t = 60 000 for the window counterexample", async () => {
    const t = makeDeps();
    const start = t.clock.nowMs();
    await acquire(t.deps, 60);
    t.clock.advance(30_000);
    expect(await acquire(t.deps, 30)).toBe(true);
    expect(t.clock.sleeps).toEqual([30_000]);
    expect(t.clock.nowMs() - start).toBe(60_000);
  });

  it("deducts tokens again for a retry", async () => {
    const t = makeDeps();
    await acquire(t.deps, 10);
    await acquire(t.deps, 10);
    expect(t.deps.state.bucket.value.tokens).toBe(40);
  });

  it("gives up without deducting when sleep never advances the clock", async () => {
    const t = makeDeps();
    await acquire(t.deps, 60);
    const stuck = { ...t.deps, sleep: () => Promise.resolve() };
    expect(await acquire(stuck, 1)).toBe(false);
    expect(stuck.state.bucket.value.tokens).toBe(0);
  });
});
