import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  ASSISTANT_LIMIT,
  ASSISTANT_WINDOW_MS,
  OPINION_LIMIT,
  ROUTE_WINDOW_MS,
  VERIFY_LIMIT,
  createFixedWindowLimiter,
} from "../src/server/rate-limit";
import type { Limiter } from "../src/server/rate-limit";
import { runs } from "./support/fc";

type Route = "verify" | "opinion" | "assistant";
const BOUNDS: Readonly<Record<Route, Readonly<{ limit: number; windowMs: number }>>> = {
  verify: { limit: VERIFY_LIMIT, windowMs: ROUTE_WINDOW_MS },
  opinion: { limit: OPINION_LIMIT, windowMs: ROUTE_WINDOW_MS },
  assistant: { limit: ASSISTANT_LIMIT, windowMs: ASSISTANT_WINDOW_MS },
};
/** Time steps of 0 to 2 windows, so sequences cross window boundaries and stay inside one. */
const arbRequests = fc.array(
  fc.record({
    step: fc.oneof(
      fc.integer({ min: 0, max: 2_000 }),
      fc.integer({ min: 0, max: 2 * ROUTE_WINDOW_MS }),
      fc.integer({ min: 0, max: 2 * ASSISTANT_WINDOW_MS }),
    ),
    address: fc.constantFrom("a", "b", "c", "local"),
    route: fc.constantFrom<Route>("verify", "opinion", "assistant"),
  }),
  { maxLength: 200 },
);

describe("route limits _Requirements: 5.2_", () => {
  // Property 1
  it("grants an address at most a route's limit in any of its windows and refuses only at the limit", () => {
    fc.assert(
      fc.property(arbRequests, (requests) => {
        let t = 0;
        const limiters: Record<Route, Limiter> = {
          verify: createFixedWindowLimiter({ ...BOUNDS.verify, now: () => t }),
          opinion: createFixedWindowLimiter({ ...BOUNDS.opinion, now: () => t }),
          assistant: createFixedWindowLimiter({ ...BOUNDS.assistant, now: () => t }),
        };
        const granted = new Map<string, number>();
        for (const { step, address, route } of requests) {
          t += step;
          const { limit, windowMs } = BOUNDS[route];
          const decision = limiters[route].check(address);
          const key = `${route}|${address}@${String(decision.windowStart)}`;
          const before = granted.get(key) ?? 0;
          expect(decision.windowStart).toBeLessThanOrEqual(t);
          expect(t).toBeLessThan(decision.windowStart + windowMs);
          if (decision.allowed) {
            expect(before).toBeLessThan(limit);
            granted.set(key, before + 1);
          } else {
            expect(before).toBe(limit);
            expect(decision.retryAfterSeconds).toBeGreaterThanOrEqual(1);
          }
        }
        for (const [key, count] of granted) {
          const route = key.slice(0, key.indexOf("|")) as Route;
          expect(count).toBeLessThanOrEqual(BOUNDS[route].limit);
        }
      }),
      { numRuns: runs() },
    );
  });
});
