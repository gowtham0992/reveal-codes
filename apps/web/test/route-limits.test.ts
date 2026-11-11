import { describe, expect, it } from "vitest";
import { handleOpinion } from "../src/server/opinion-route";
import {
  OPINION_LIMIT,
  ROUTE_WINDOW_MS,
  VERIFY_LIMIT,
  createFixedWindowLimiter,
  routeGuard,
} from "../src/server/rate-limit";
import type { Limiter, RouteGuard } from "../src/server/rate-limit";
import { handleVerify } from "../src/server/verify-route";
import { CHECKS_BUSY } from "../src/notices";
import { fixturesDeps, postJson, recordingLiveDeps } from "./support/route-deps";

const MESSAGE = "Too many checks from this address. Try again in a moment.";

function clock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number): void => {
      t += ms;
    },
  };
}
function limiter(limit: number, now: () => number): Limiter {
  return createFixedWindowLimiter({ limit, windowMs: ROUTE_WINDOW_MS, now });
}
function request(address?: string): Request {
  return new Request("http://localhost/api/verify", {
    method: "POST",
    body: '{"records":[]}',
    ...(address === undefined ? {} : { headers: { "x-forwarded-for": address } }),
  });
}
const guard = (l: Limiter, address: string | undefined, live = true): RouteGuard =>
  routeGuard(l, request(address), live);

describe("request limits are 6 verify and 30 opinion per minute", () => {
  it("states the numbers", () => {
    expect(VERIFY_LIMIT).toBe(6);
    expect(OPINION_LIMIT).toBe(30);
    expect(ROUTE_WINDOW_MS).toBe(60_000);
    expect(CHECKS_BUSY).toBe(MESSAGE);
  });
});

describe("/api/verify limiter", () => {
  it("passes six requests and answers the seventh with 429, Retry-After and the fixed message", async () => {
    const c = clock();
    const l = limiter(VERIFY_LIMIT, c.now);
    const { deps, calls } = recordingLiveDeps();
    for (let i = 1; i <= 6; i += 1) {
      const res = await handleVerify(request("203.0.113.9"), deps, guard(l, "203.0.113.9"));
      expect(res.status, `request ${String(i)}`).toBe(200);
    }
    c.advance(20_000);
    const refused = await handleVerify(request("203.0.113.9"), deps, guard(l, "203.0.113.9"));
    expect(refused.status).toBe(429);
    expect(refused.headers.get("Retry-After")).toBe("40");
    expect(refused.headers.get("Cache-Control")).toBe("no-store");
    expect(await refused.json()).toEqual({ error: MESSAGE });
    expect(calls).toHaveLength(0);
  });

  it("refuses before the body is read or any lookup is made", async () => {
    const l = limiter(1, clock().now);
    const { deps, calls } = recordingLiveDeps();
    await handleVerify(postJson('{"records":[]}'), deps, guard(l, "a"));
    const refused = await handleVerify(postJson("{not json"), deps, guard(l, "a"));
    expect(refused.status).toBe(429);
    expect(calls).toHaveLength(0);
  });

  it("passes again in a new window", async () => {
    const c = clock();
    const l = limiter(VERIFY_LIMIT, c.now);
    for (let i = 0; i < 7; i += 1) await handleVerify(request("a"), fixturesDeps(), guard(l, "a"));
    c.advance(ROUTE_WINDOW_MS);
    const res = await handleVerify(request("a"), fixturesDeps(), guard(l, "a"));
    expect(res.status).toBe(200);
  });

  it("counts each address on its own, and requests without the header under local", async () => {
    const l = limiter(VERIFY_LIMIT, clock().now);
    for (let i = 0; i < 6; i += 1) await handleVerify(request("a"), fixturesDeps(), guard(l, "a"));
    expect((await handleVerify(request("a"), fixturesDeps(), guard(l, "a"))).status).toBe(429);
    expect((await handleVerify(request("b"), fixturesDeps(), guard(l, "b"))).status).toBe(200);
    for (let i = 0; i < 6; i += 1) {
      await handleVerify(request(), fixturesDeps(), guard(l, undefined));
    }
    expect((await handleVerify(request(), fixturesDeps(), guard(l, undefined))).status).toBe(429);
  });

  it("never limits demo mode", async () => {
    const l = limiter(VERIFY_LIMIT, clock().now);
    for (let i = 0; i < 25; i += 1) {
      const res = await handleVerify(request("a"), fixturesDeps(), guard(l, "a", false));
      expect(res.status, `request ${String(i + 1)}`).toBe(200);
    }
    // A demo request does not spend a live request either.
    expect((await handleVerify(request("a"), fixturesDeps(), guard(l, "a"))).status).toBe(200);
  });
});

describe("/api/opinion limiter", () => {
  it("passes thirty requests and answers the thirty-first with 429, Retry-After and the fixed message", async () => {
    const c = clock();
    const l = limiter(OPINION_LIMIT, c.now);
    for (let i = 1; i <= 30; i += 1) {
      const res = await handleOpinion("108432", fixturesDeps(), guard(l, "a"));
      expect(res.status, `request ${String(i)}`).toBe(200);
    }
    c.advance(1_500);
    const refused = await handleOpinion("108432", fixturesDeps(), guard(l, "a"));
    expect(refused.status).toBe(429);
    expect(refused.headers.get("Retry-After")).toBe("59");
    expect(await refused.json()).toEqual({ error: MESSAGE });
  });

  it("refuses before the id is checked, and counts a bad id like any request", async () => {
    const l = limiter(1, clock().now);
    expect((await handleOpinion("abc", fixturesDeps(), guard(l, "a"))).status).toBe(400);
    expect((await handleOpinion("abc", fixturesDeps(), guard(l, "a"))).status).toBe(429);
  });

  it("never limits demo mode and keeps verify and opinion counts apart", async () => {
    const verify = limiter(VERIFY_LIMIT, clock().now);
    const opinion = limiter(OPINION_LIMIT, clock().now);
    for (let i = 0; i < 40; i += 1) {
      const res = await handleOpinion("108432", fixturesDeps(), guard(opinion, "a", false));
      expect(res.status).toBe(200);
    }
    for (let i = 0; i < 6; i += 1)
      await handleVerify(request("a"), fixturesDeps(), guard(verify, "a"));
    expect((await handleOpinion("108432", fixturesDeps(), guard(opinion, "a"))).status).toBe(200);
  });
});
