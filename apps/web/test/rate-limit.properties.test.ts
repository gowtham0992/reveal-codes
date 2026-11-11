import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createFixedWindowLimiter } from "../src/server/rate-limit";
import { runs } from "./support/fc";
const LIMIT = 10;
const WINDOW_MS = 600_000;
/** Time steps of 0 to 2 windows, so sequences cross window boundaries and stay inside one. */
const arbRequests = fc.array(
  fc.record({
    step: fc.oneof(fc.integer({ min: 0, max: 5_000 }), fc.integer({ min: 0, max: 2 * WINDOW_MS })),
    address: fc.constantFrom("a", "b", "c", "local"),
  }),
  { maxLength: 150 },
);
describe("fixed-window limiter _Requirements: 5.2_", () => {
  // Property 1
  it("grants an address at most 10 requests in a window and refuses only at 10", () => {
    fc.assert(
      fc.property(arbRequests, (requests) => {
        let t = 0;
        const limiter = createFixedWindowLimiter({
          limit: LIMIT,
          windowMs: WINDOW_MS,
          now: () => t,
        });
        const granted = new Map<string, number>();
        for (const { step, address } of requests) {
          t += step;
          const decision = limiter.check(address);
          const key = `${address}@${String(decision.windowStart)}`;
          const before = granted.get(key) ?? 0;
          expect(decision.windowStart).toBeLessThanOrEqual(t);
          expect(t).toBeLessThan(decision.windowStart + WINDOW_MS);
          if (decision.allowed) {
            expect(before).toBeLessThan(LIMIT);
            granted.set(key, before + 1);
          } else {
            expect(before).toBe(LIMIT);
            expect(decision.retryAfterSeconds).toBeGreaterThanOrEqual(1);
          }
        }
        for (const count of granted.values()) expect(count).toBeLessThanOrEqual(LIMIT);
      }),
      { numRuns: runs() },
    );
  });
});
