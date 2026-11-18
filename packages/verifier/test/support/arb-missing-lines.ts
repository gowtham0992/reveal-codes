import * as fc from "fast-check";
import type { CitationRecord } from "@reveal-codes/engine";
import { createDeps } from "../../src/create-deps";
import type { CacheStore, Deps, FetchLike, HttpResponse } from "../../src/deps";
import { planLookup } from "../../src/lookup";
import { arbRecords } from "./arb-records";
import { createManualClock } from "./manual-clock";

/** How one Citation_Line is seeded in the memory cache. */
export type Seed = "valid" | "invalid" | "absent";

/** Property 5 input: records and a seed for each of their Citation_Lines (in plan order). */
export type MissingCase = Readonly<{
  records: readonly CitationRecord[];
  seeds: readonly Seed[];
  invalidShape: number;
}>;

const arbSeed: fc.Arbitrary<Seed> = fc.constantFrom("valid", "invalid", "absent");

export const arbMissingCase: fc.Arbitrary<MissingCase> = arbRecords.chain((records) =>
  fc.record({
    records: fc.constant(records),
    seeds: fc.array(arbSeed, {
      minLength: planLookup(records).lines.length,
      maxLength: planLookup(records).lines.length,
    }),
    invalidShape: fc.nat({ max: 2 }),
  }),
);

const VALID_ENTRY = { status: "verified", clusterId: "1", cluster: { case_name: "A v. B" } };

/** Entries that fail `isCachedLine`: verified with no cluster record, an unknown status, a string. */
function invalidEntry(shape: number): unknown {
  if (shape === 0) return { status: "verified", clusterId: "1" };
  if (shape === 1) return { status: "bogus" };
  return "not an entry";
}

/** A Map-backed store that can show its contents. Stores keep no expiry, which the case never reaches. */
export type ObservableStore = Readonly<{ store: CacheStore; contents(): readonly unknown[] }>;

export function observableStore(): ObservableStore {
  const entries = new Map<string, unknown>();
  const store: CacheStore = {
    get: (key) => Promise.resolve(entries.get(key)),
    set: (key, value) => {
      entries.set(key, value);
      return Promise.resolve();
    },
    delete: (key) => {
      entries.delete(key);
      return Promise.resolve();
    },
  };
  return { store, contents: () => [...entries.entries()].sort(([a], [b]) => a.localeCompare(b)) };
}

export function seedStore(s: ObservableStore, c: MissingCase): void {
  const lines = planLookup(c.records).lines;
  lines.forEach((line, i) => {
    const seed = c.seeds[i];
    if (seed === "valid") void s.store.set(line, VALID_ENTRY, "2099-01-01T00:00:00.000Z");
    if (seed === "invalid") {
      void s.store.set(line, invalidEntry(c.invalidShape), "2099-01-01T00:00:00.000Z");
    }
  });
}

export type RecordingFetch = Readonly<{ fetch: FetchLike; sentLines(): readonly string[] }>;

function respond(body: unknown): HttpResponse {
  return {
    status: 200,
    headers: { get: () => null },
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

/** Answers every request with a `404` entry per line and records the lines it was sent. */
export function recordingFetch(): RecordingFetch {
  const sent: string[] = [];
  const fetch: FetchLike = (_url, init) => {
    const text = new URLSearchParams(init.body ?? "").get("text") ?? "";
    const lines = text === "" ? [] : text.split("\n");
    sent.push(...lines);
    return Promise.resolve(respond(lines.map(() => ({ status: 404, clusters: [] }))));
  };
  return { fetch, sentLines: () => sent };
}

export type Rig = Readonly<{ deps: Deps; store: ObservableStore; sent: RecordingFetch }>;

/** Fresh deps over a seeded store, a recording fetch and a fixed clock. */
export function makeRig(c: MissingCase): Rig {
  const clock = createManualClock(Date.UTC(2026, 0, 1));
  const store = observableStore();
  seedStore(store, c);
  const sent = recordingFetch();
  const deps = createDeps({
    fetch: sent.fetch,
    now: clock.now,
    sleep: clock.sleep,
    cache: store.store,
    baseUrl: "https://cl.test/api/rest/v4",
  });
  return { deps, store, sent };
}
