import { createDeps, createMemoryCacheStore } from "@reveal-codes/verifier";
import type { CacheStore, Deps, FetchInit, HttpResponse } from "@reveal-codes/verifier";
import { realSleep } from "../../src/server/deps";
import {
  ROUTE_WINDOW_MS,
  VERIFY_CEILING,
  VERIFY_LIMIT,
  createFixedWindowLimiter,
  routeGuard,
} from "../../src/server/rate-limit";
import type { Limiter } from "../../src/server/rate-limit";
import { handleVerify } from "../../src/server/verify-route";
import type { FullRecord, VerifyGuards } from "../../src/server/verify-route";
import { demoRecords } from "./route-deps";

export type LiveCall = Readonly<{ url: string; lines: readonly string[] }>;

export type ServiceMode = "resolve" | "unchecked";

/** Live-mode Verifier deps over a memory cache and a recording fetch, with one shared clock. */
export type LiveSetup = Readonly<{
  deps: Deps;
  calls: LiveCall[];
  cache: CacheStore;
  /** While `on`, the next defined cache read deletes its entry after answering (a vanishing entry). */
  vanish: { on: boolean };
  service: { mode: ServiceMode };
  advance: (ms: number) => void;
  ceiling: Limiter;
  verify: Limiter;
}>;

const BASE_URL = "https://cl.test/api/rest/v4";

function answer(body: string): HttpResponse {
  return { status: 200, headers: { get: () => null }, text: () => Promise.resolve(body) };
}

function linesOf(init: FetchInit): readonly string[] {
  return decodeURIComponent((init.body ?? "").slice("text=".length)).split("\n");
}

function vanishingCache(now: () => number, vanish: { on: boolean }): CacheStore {
  const inner = createMemoryCacheStore({ now: () => new Date(now()) });
  return {
    ...inner,
    async get(key) {
      const value = await inner.get(key);
      if (vanish.on && value !== undefined) {
        vanish.on = false;
        await inner.delete(key);
      }
      return value;
    },
  };
}

function recordingFetch(calls: LiveCall[], service: { mode: ServiceMode }) {
  return (url: string, init: FetchInit): Promise<HttpResponse> => {
    const lines = linesOf(init);
    calls.push({ url, lines });
    if (service.mode === "unchecked") return Promise.resolve(answer("[]"));
    const entries = lines.map((_, i) => ({
      status: 200,
      clusters: [{ id: 1000 + calls.length * 100 + i, case_name: "Some v. Case" }],
    }));
    return Promise.resolve(answer(JSON.stringify(entries)));
  };
}

function liveDeps(
  now: () => number,
  cache: CacheStore,
  calls: LiveCall[],
  service: { mode: ServiceMode },
): Deps {
  return createDeps({
    fetch: recordingFetch(calls, service),
    now: () => new Date(now()),
    sleep: realSleep,
    cache,
    token: "test-token",
    baseUrl: BASE_URL,
  });
}

export function liveSetup(start = 1_700_000_000_000): LiveSetup {
  let t = start;
  const now = (): number => t;
  const calls: LiveCall[] = [];
  const service: { mode: ServiceMode } = { mode: "resolve" };
  const vanish = { on: false };
  const cache = vanishingCache(now, vanish);
  const make = (limit: number): Limiter =>
    createFixedWindowLimiter({ limit, windowMs: ROUTE_WINDOW_MS, now });
  return {
    deps: liveDeps(now, cache, calls, service),
    calls,
    cache,
    vanish,
    service,
    advance: (ms) => {
      t += ms;
    },
    ceiling: make(VERIFY_CEILING),
    verify: make(VERIFY_LIMIT),
  };
}

const [demoFirst] = demoRecords();
if (demoFirst === undefined) throw new Error("demo motion has no full citation");
const first: FullRecord = demoFirst;

/** One full reporter record per page, with no case name so a resolved line stays `verified`. */
export function recordsFor(pages: readonly number[]): readonly FullRecord[] {
  const { start, end, text } = first.citation;
  return pages.map((page): FullRecord => ({
    kind: "full",
    key: `k${String(page)}`,
    result: first.result,
    citation: {
      start,
      end,
      text,
      value: { kind: "reporter", volume: 410, reporter: "U.S.", page },
    },
  }));
}

export function postRecords(records: readonly FullRecord[]): string {
  return JSON.stringify({ records });
}

export function guardsFor(setup: LiveSetup, request: Request, live = true): VerifyGuards {
  return {
    ceiling: routeGuard(setup.ceiling, request, live),
    verify: routeGuard(setup.verify, request, live),
  };
}

/** One POST to the route from `address` with a live guard pair. */
export function send(setup: LiveSetup, body: string, address = "198.51.100.1"): Promise<Response> {
  const request = new Request("http://localhost/api/verify", {
    method: "POST",
    body,
    headers: { "x-forwarded-for": address },
  });
  return handleVerify(request, setup.deps, guardsFor(setup, request));
}
