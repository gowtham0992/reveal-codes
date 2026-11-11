import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  ASSISTANT_HOURLY_LIMIT,
  ASSISTANT_HOURLY_WINDOW_MS,
  ASSISTANT_LIMIT,
  ASSISTANT_WINDOW_MS,
  OPINION_LIMIT,
  ROUTE_WINDOW_MS,
  VERIFY_LIMIT,
  allOf,
  createFixedWindowLimiter,
  createTotalLimiter,
} from "../src/server/rate-limit";
import type { Decision, Limiter } from "../src/server/rate-limit";
import { runs } from "./support/fc";

type Route = "verify" | "opinion" | "assistant";
type Request = Readonly<{ step: number; address: string; route: Route }>;
const BOUNDS = {
  verify: { limit: VERIFY_LIMIT, windowMs: ROUTE_WINDOW_MS },
  opinion: { limit: OPINION_LIMIT, windowMs: ROUTE_WINDOW_MS },
  assistant: { limit: ASSISTANT_LIMIT, windowMs: ASSISTANT_WINDOW_MS },
} as const;
const TOTAL = { limit: ASSISTANT_HOURLY_LIMIT, windowMs: ASSISTANT_HOURLY_WINDOW_MS } as const;
/** Many addresses, so the assistant's total can be reached before any one address is. */
const ADDRESSES = Array.from({ length: 30 }, (_, i) => `198.51.100.${String(i)}`);
/** Bursts of tiny steps, now and then a gap of a route window, rarely a gap of an hour. */
const arbRequests = fc.array(
  fc.record({
    step: fc.oneof(
      { weight: 400, arbitrary: fc.integer({ min: 0, max: 300 }) },
      { weight: 6, arbitrary: fc.integer({ min: 0, max: 2 * ROUTE_WINDOW_MS }) },
      { weight: 1, arbitrary: fc.integer({ min: 0, max: 2 * ASSISTANT_HOURLY_WINDOW_MS }) },
    ),
    address: fc.constantFrom(...ADDRESSES),
    route: fc.constantFrom<Route>(
      "verify",
      "opinion",
      "assistant",
      "assistant",
      "assistant",
      "assistant",
      "assistant",
      "assistant",
    ),
  }),
  { maxLength: 1500, size: "max" },
);

type World = Readonly<{
  limiters: Readonly<Record<Route, Limiter>>;
  ownBound: Limiter;
  totalBound: Limiter;
}>;
function buildWorld(now: () => number): World {
  const ownBound = createFixedWindowLimiter({ ...BOUNDS.assistant, now });
  const totalBound = createTotalLimiter({ ...TOTAL, now });
  return {
    ownBound,
    totalBound,
    limiters: {
      verify: createFixedWindowLimiter({ ...BOUNDS.verify, now }),
      opinion: createFixedWindowLimiter({ ...BOUNDS.opinion, now }),
      assistant: allOf(ownBound, totalBound),
    },
  };
}

type Tally = { address: number; all: number };
/** Counts grants per bound and window, and checks each decision against the bounds before it. */
function replay(requests: readonly Request[]): Tally {
  const tally: Tally = { address: 0, all: 0 };
  let t = 0;
  const world = buildWorld(() => t);
  const granted = new Map<string, number>();
  const count = (key: string): number => granted.get(key) ?? 0;
  for (const { step, address, route } of requests) {
    t += step;
    const own = route === "assistant" ? world.ownBound : world.limiters[route];
    const ownBefore: Decision = own.peek(address);
    const totalBefore = route === "assistant" ? world.totalBound.peek(address) : null;
    const decision = world.limiters[route].check(address);
    const ownKey = `${route}|${address}@${String(ownBefore.windowStart)}`;
    const totalKey = totalBefore === null ? null : `all@${String(totalBefore.windowStart)}`;
    // Refused only when a bound is already reached, and the right one is named.
    const reached = !ownBefore.allowed || totalBefore?.allowed === false;
    expect(decision.allowed).toBe(!reached);
    if (decision.allowed) {
      expect(count(ownKey)).toBeLessThan(BOUNDS[route].limit);
      granted.set(ownKey, count(ownKey) + 1);
      if (totalKey !== null) {
        expect(count(totalKey)).toBeLessThan(TOTAL.limit);
        granted.set(totalKey, count(totalKey) + 1);
      }
    } else {
      expect(decision.scope).toBe(ownBefore.allowed ? "all" : "address");
      tally[decision.scope] += 1;
      expect(decision.retryAfterSeconds).toBeGreaterThanOrEqual(1);
      expect(count(decision.scope === "all" ? (totalKey ?? "") : ownKey)).toBe(
        decision.scope === "all" ? TOTAL.limit : BOUNDS[route].limit,
      );
    }
  }
  for (const [key, n] of granted) {
    const bound = key.startsWith("all@") ? TOTAL.limit : BOUNDS[key.split("|")[0] as Route].limit;
    expect(n).toBeLessThanOrEqual(bound);
  }
  return tally;
}

describe("route limits _Requirements: 5.2_", () => {
  // Property 1
  it("never grants more than a route's limit per address window or the hourly total, and refuses only at a bound", () => {
    fc.assert(
      fc.property(arbRequests, (requests) => {
        replay(requests);
      }),
      { numRuns: runs() },
    );
  });

  it("the generated sequences reach both the address bound and the hourly bound", () => {
    const tallies = fc.sample(arbRequests, { numRuns: runs(), seed: 7 }).map(replay);
    expect(tallies.some((t) => t.address > 0)).toBe(true);
    expect(tallies.some((t) => t.all > 0)).toBe(true);
  });
});
