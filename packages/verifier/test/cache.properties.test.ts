import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { VerificationResult } from "@reveal-codes/engine";
import { cacheSet } from "../src/cache-access";
import { createFileCacheStore } from "../src/cache-file";
import { createMemoryCacheStore } from "../src/cache-memory";
import { createDeps } from "../src/create-deps";
import type { CacheStore } from "../src/deps";
// The engine's `testing/` folder is deliberately not exported from its index (engine Req 1.2).
import { arbVerificationResult } from "../../engine/src/testing/arb-state";
import { arbAnyString } from "../../engine/src/testing/arb-text";
import { runs } from "./support/fc";
import { createManualClock } from "./support/manual-clock";
import type { ManualClock } from "./support/manual-clock";

type Terminal = Exclude<VerificationResult, { status: "unchecked" }>;

const arbTerminal: fc.Arbitrary<Terminal> = arbVerificationResult.filter(
  (r): r is Terminal => r.status !== "unchecked",
);

const arbCase = fc.record({
  kind: fc.constantFrom("memory", "file"),
  /** a, b stored; absent never stored; unchecked offered through cacheSet. */
  keys: fc.uniqueArray(arbAnyString, { minLength: 4, maxLength: 4 }),
  a: arbTerminal,
  b: arbTerminal,
  unchecked: fc
    .option(fc.string({ maxLength: 12 }), { nil: undefined })
    .map((waitUntil): VerificationResult =>
      waitUntil === undefined ? { status: "unchecked" } : { status: "unchecked", waitUntil },
    ),
  startMs: fc.integer({ min: 0, max: 4_000_000_000_000 }),
  delayMs: fc.integer({ min: 1, max: 2_000_000_000 }),
  extraMs: fc.integer({ min: 0, max: 2_000_000_000 }),
});

type Case = typeof arbCase extends fc.Arbitrary<infer T> ? T : never;

function makeStore(kind: Case["kind"], dir: string, clock: ManualClock): CacheStore {
  return kind === "memory"
    ? createMemoryCacheStore({ now: clock.now })
    : createFileCacheStore({ dir, now: clock.now });
}

function neverFetch(): Promise<never> {
  return Promise.reject(new Error("no network in this test"));
}

async function assertUncheckedNeverWritten(
  c: Case,
  store: CacheStore,
  clock: ManualClock,
  dir: string,
): Promise<void> {
  const deps = createDeps({
    fetch: neverFetch,
    now: clock.now,
    sleep: clock.sleep,
    cache: store,
    baseUrl: "https://cl.test/api/rest/v4",
  });
  const [, , , unkey] = c.keys as [string, string, string, string];
  await cacheSet(deps, unkey, c.unchecked);
  expect(await store.get(unkey)).toBeUndefined();
  expect(deps.state.counters.value.writes).toBe(0);
  expect(await readdir(dir)).toEqual([]);
}

async function assertRoundTripAndExpiry(
  c: Case,
  store: CacheStore,
  clock: ManualClock,
  dir: string,
): Promise<void> {
  const [ka, kb, absent] = c.keys as [string, string, string, string];
  const expiresAt = new Date(c.startMs + c.delayMs).toISOString();
  await store.set(ka, c.a, expiresAt);
  await store.set(kb, c.b, expiresAt);
  // Strictly before expiry: deep equality, and nothing leaks to other keys.
  clock.advance(c.delayMs - 1);
  expect(await store.get(ka)).toEqual(c.a);
  expect(await store.get(kb)).toEqual(c.b);
  expect(await store.get(absent)).toBeUndefined();
  // At expiry and after: a miss.
  clock.advance(1);
  expect(await store.get(ka)).toBeUndefined();
  expect(await store.get(kb)).toBeUndefined();
  clock.advance(c.extraMs);
  expect(await store.get(ka)).toBeUndefined();
  expect(await store.get(kb)).toBeUndefined();
  if (c.kind === "file") {
    // Two distinct keys, two distinct files, all inside the directory, no temp leftovers.
    const names = await readdir(dir);
    expect(names).toHaveLength(2);
    expect(names.every((n) => n.endsWith(".json"))).toBe(true);
  }
}

async function runCase(c: Case): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), "rc-cache-prop-"));
  const dir = path.join(root, "cache");
  try {
    await mkdir(dir);
    const clock = createManualClock(c.startMs);
    const store = makeStore(c.kind, dir, clock);
    await assertUncheckedNeverWritten(c, store, clock, dir);
    await assertRoundTripAndExpiry(c, store, clock, dir);
    // Nothing was written beside the cache directory.
    expect(await readdir(root)).toEqual(["cache"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

// Property 5
// Feature: citation-verifier, Property 5: Cache round trip and expiry hold for both stores
describe("Property 5: cache round trip and expiry _Requirements: 10.3, 10.6, 10.8, 10.11_", () => {
  it("holds for the memory and file stores, and unchecked is never written", async () => {
    await fc.assert(fc.asyncProperty(arbCase, runCase), { numRuns: runs() });
  });
});

describe("Property 5 named examples", () => {
  it("runs the hostile keys the example tests use against both stores", async () => {
    for (const kind of ["memory", "file"] as const) {
      await runCase({
        kind,
        keys: ["../x", "a/b", "..", ".."].map((k, i) => (i === 3 ? "A:b c" : k)),
        a: { status: "verified", clusterId: "7" },
        b: { status: "not_found" },
        unchecked: { status: "unchecked" },
        startMs: 0,
        delayMs: 1,
        extraMs: 0,
      });
    }
  });
});
