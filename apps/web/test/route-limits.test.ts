import { describe, expect, it } from "vitest";
import { handleOpinion } from "../src/server/opinion-route";
import {
  OPINION_LIMIT,
  ROUTE_WINDOW_MS,
  VERIFY_CEILING,
  VERIFY_LIMIT,
  createFixedWindowLimiter,
  routeGuard,
} from "../src/server/rate-limit";
import type { Limiter, RouteGuard } from "../src/server/rate-limit";
import { MAX_BODY_BYTES, handleVerify } from "../src/server/verify-route";
import { CHECKS_BUSY } from "../src/notices";
import { demoRecords, fixturesDeps } from "./support/route-deps";
import { guardsFor, liveSetup, postRecords, recordsFor, send } from "./support/live-verify";

const MESSAGE = "Too many checks from this address. Try again in a moment.";
const EMPTY = '{"records":[]}';

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
function opinionGuard(l: Limiter, address: string, live = true): RouteGuard {
  const request = new Request("http://localhost/api/opinion/1", {
    headers: { "x-forwarded-for": address },
  });
  return routeGuard(l, request, live);
}
async function statuses(count: number, run: (i: number) => Promise<Response>): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) out.push((await run(i)).status);
  return out;
}
const all = (status: number, count: number): number[] => Array<number>(count).fill(status);

describe("request limits are 10 and 60 verify and 30 opinion per minute _Requirements: 24.5, 24.16, 24.18_", () => {
  it("states the numbers", () => {
    expect(VERIFY_LIMIT).toBe(10);
    expect(VERIFY_CEILING).toBe(60);
    expect(OPINION_LIMIT).toBe(30);
    expect(ROUTE_WINDOW_MS).toBe(60_000);
    expect(CHECKS_BUSY).toBe(MESSAGE);
  });
});

describe("/api/verify Verify_Limit counts Service_Requests _Requirements: 24.2, 24.3, 24.4, 24.21_", () => {
  it("answers 200 up to 10, then 429 with the unchanged sentence and headers and no lookup", async () => {
    const s = liveSetup();
    expect(await statuses(10, (i) => send(s, postRecords(recordsFor([i + 1]))))).toEqual(
      all(200, 10),
    );
    s.advance(20_000);
    const refused = await send(s, postRecords(recordsFor([99])));
    expect(refused.status).toBe(429);
    expect(refused.headers.get("Retry-After")).toBe("40");
    expect(refused.headers.get("Cache-Control")).toBe("no-store");
    expect(await refused.json()).toEqual({ error: MESSAGE });
    expect(s.calls).toHaveLength(10);
  });

  it("counts a request once however many lines it sends", async () => {
    const s = liveSetup();
    const three = (i: number) => postRecords(recordsFor([3 * i + 1, 3 * i + 2, 3 * i + 3]));
    expect(await statuses(10, (i) => send(s, three(i)))).toEqual(all(200, 10));
    expect((await send(s, three(10))).status).toBe(429);
    expect(s.calls).toHaveLength(10);
  });

  it("answers 200 again in the next window", async () => {
    const s = liveSetup();
    await statuses(11, (i) => send(s, postRecords(recordsFor([i + 1]))));
    s.advance(ROUTE_WINDOW_MS);
    expect((await send(s, postRecords(recordsFor([50])))).status).toBe(200);
  });

  it("counts each address on its own, and requests without the header under local", async () => {
    const s = liveSetup();
    await statuses(10, (i) => send(s, postRecords(recordsFor([i + 1])), "a"));
    expect((await send(s, postRecords(recordsFor([40])), "a")).status).toBe(429);
    expect((await send(s, postRecords(recordsFor([41])), "b")).status).toBe(200);
    const bare = (page: number): Promise<Response> => {
      const request = new Request("http://localhost/api/verify", {
        method: "POST",
        body: postRecords(recordsFor([page])),
      });
      return handleVerify(request, s.deps, guardsFor(s, request));
    };
    expect(await statuses(10, (i) => bare(60 + i))).toEqual(all(200, 10));
    expect((await bare(80)).status).toBe(429);
  });
});

describe("/api/verify cached drafts never trip the Verify_Limit _Requirements: 24.1, 24.10, 24.20_", () => {
  it("answers 200 on every repeat up to the ceiling and calls the service once", async () => {
    const s = liveSetup();
    const body = postRecords(recordsFor([1, 2]));
    const first = await send(s, body);
    const expected = await first.text();
    const repeats = await statuses(VERIFY_CEILING - 1, (i) =>
      send(s, body).then(async (res) => {
        if (i === 0) expect(await res.text()).toBe(expected);
        return res;
      }),
    );
    expect(repeats).toEqual(all(200, VERIFY_CEILING - 1));
    expect(s.calls).toHaveLength(1);
  });

  it("leaves the Verify_Limit unspent by repeats: only the first request and nine more are counted", async () => {
    const s = liveSetup();
    await send(s, postRecords(recordsFor([1])));
    await statuses(20, () => send(s, postRecords(recordsFor([1]))));
    expect(await statuses(9, (i) => send(s, postRecords(recordsFor([i + 2]))))).toEqual(
      all(200, 9),
    );
    expect((await send(s, postRecords(recordsFor([31])))).status).toBe(429);
  });
});

describe("/api/verify what counts _Requirements: 24.3, 24.12, 24.13, 24.14, 24.22_", () => {
  it("counts a partly cached request once", async () => {
    const s = liveSetup();
    await send(s, postRecords(recordsFor([1])));
    const partly = (i: number) => postRecords(recordsFor([1, 100 + i]));
    expect(await statuses(9, (i) => send(s, partly(i)))).toEqual(all(200, 9));
    expect((await send(s, partly(9))).status).toBe(429);
  });

  it("does not count an empty records list", async () => {
    const s = liveSetup();
    expect(await statuses(25, () => send(s, EMPTY))).toEqual(all(200, 25));
    expect(s.calls).toHaveLength(0);
    expect(await statuses(10, (i) => send(s, postRecords(recordsFor([i + 1]))))).toEqual(
      all(200, 10),
    );
    expect((await send(s, postRecords(recordsFor([40])))).status).toBe(429);
  });

  it("keeps counting a line that comes back unchecked, because it is never cached", async () => {
    const s = liveSetup();
    s.service.mode = "unchecked";
    const body = postRecords(recordsFor([1]));
    expect(await statuses(10, () => send(s, body))).toEqual(all(200, 10));
    expect((await send(s, body)).status).toBe(429);
    expect(s.calls).toHaveLength(10);
  });

  it("does not count a request the limit refused a second time", async () => {
    const s = liveSetup();
    await statuses(10, (i) => send(s, postRecords(recordsFor([i + 1]))));
    expect(await statuses(5, () => send(s, postRecords(recordsFor([77]))))).toEqual(all(429, 5));
    s.advance(ROUTE_WINDOW_MS);
    expect((await send(s, postRecords(recordsFor([77])))).status).toBe(200);
    expect(s.calls).toHaveLength(11);
  });

  it("neither refuses nor double counts when a cache entry vanishes between the two reads", async () => {
    const s = liveSetup();
    await send(s, postRecords(recordsFor([1])));
    await statuses(9, (i) => send(s, postRecords(recordsFor([i + 2]))));
    expect(s.calls).toHaveLength(10);
    s.vanish.on = true;
    const res = await send(s, postRecords(recordsFor([1])));
    expect(res.status).toBe(200);
    expect(s.calls).toHaveLength(11);
    // The vanished-entry request was never counted: the limit is still at 10 used, so one more refuses.
    expect((await send(s, postRecords(recordsFor([50])))).status).toBe(429);
  });
});

describe("/api/verify Request_Ceiling _Requirements: 24.16, 24.17_", () => {
  it("answers the 61st request of any kind with 429 before the body is read", async () => {
    const s = liveSetup();
    expect(await statuses(VERIFY_CEILING, () => send(s, EMPTY))).toEqual(all(200, VERIFY_CEILING));
    const request = new Request("http://localhost/api/verify", {
      method: "POST",
      body: "{not json",
      headers: { "x-forwarded-for": "198.51.100.1" },
    });
    const refused = await handleVerify(request, s.deps, guardsFor(s, request));
    expect(refused.status).toBe(429);
    expect(request.bodyUsed).toBe(false);
    expect(refused.headers.get("Retry-After")).toBe("60");
    expect(await refused.json()).toEqual({ error: MESSAGE });
    expect(s.calls).toHaveLength(0);
  });

  it("counts a malformed request and a refused one like any other", async () => {
    const s = liveSetup();
    await statuses(30, () => send(s, "{not json"));
    await statuses(30, () => send(s, EMPTY));
    expect((await send(s, EMPTY)).status).toBe(429);
  });

  it("counts each address on its own and opens again in the next window", async () => {
    const s = liveSetup();
    await statuses(VERIFY_CEILING, () => send(s, EMPTY, "a"));
    expect((await send(s, EMPTY, "a")).status).toBe(429);
    expect((await send(s, EMPTY, "b")).status).toBe(200);
    s.advance(ROUTE_WINDOW_MS);
    expect((await send(s, EMPTY, "a")).status).toBe(200);
  });

  it("keeps the body checks: a malformed or oversize body at the Verify_Limit answers 400 or 413", async () => {
    const s = liveSetup();
    await statuses(10, (i) => send(s, postRecords(recordsFor([i + 1]))));
    expect((await send(s, "{not json")).status).toBe(400);
    expect((await send(s, '{"records":"x"}')).status).toBe(400);
    expect((await send(s, " ".repeat(MAX_BODY_BYTES + 1))).status).toBe(413);
    expect((await send(s, postRecords(recordsFor([90])))).status).toBe(429);
  });
});

describe("/api/verify fixtures mode never limits _Requirements: 24.15, 24.23_", () => {
  it("applies neither limit, and spends neither", async () => {
    const s = liveSetup();
    const body = JSON.stringify({ records: demoRecords() });
    for (let i = 0; i < VERIFY_CEILING + 15; i += 1) {
      const request = new Request("http://localhost/api/verify", { method: "POST", body });
      const res = await handleVerify(request, fixturesDeps(), guardsFor(s, request, false));
      expect(res.status, `request ${String(i + 1)}`).toBe(200);
    }
    expect(await statuses(10, (i) => send(s, postRecords(recordsFor([i + 1]))))).toEqual(
      all(200, 10),
    );
  });
});

describe("/api/opinion limiter _Requirements: 24.18_", () => {
  it("passes thirty requests and answers the thirty-first with 429, Retry-After and the fixed message", async () => {
    const c = clock();
    const l = limiter(OPINION_LIMIT, c.now);
    for (let i = 1; i <= 30; i += 1) {
      const res = await handleOpinion("108432", fixturesDeps(), opinionGuard(l, "a"));
      expect(res.status, `request ${String(i)}`).toBe(200);
    }
    c.advance(1_500);
    const refused = await handleOpinion("108432", fixturesDeps(), opinionGuard(l, "a"));
    expect(refused.status).toBe(429);
    expect(refused.headers.get("Retry-After")).toBe("59");
    expect(await refused.json()).toEqual({ error: MESSAGE });
  });

  it("refuses before the id is checked, and counts a bad id like any request", async () => {
    const l = limiter(1, clock().now);
    expect((await handleOpinion("abc", fixturesDeps(), opinionGuard(l, "a"))).status).toBe(400);
    expect((await handleOpinion("abc", fixturesDeps(), opinionGuard(l, "a"))).status).toBe(429);
  });

  it("never limits demo mode and is counted apart from verify", async () => {
    const s = liveSetup();
    const opinion = limiter(OPINION_LIMIT, clock().now);
    for (let i = 0; i < 40; i += 1) {
      const res = await handleOpinion("108432", fixturesDeps(), opinionGuard(opinion, "a", false));
      expect(res.status).toBe(200);
    }
    await statuses(10, (i) => send(s, postRecords(recordsFor([i + 1])), "a"));
    const res = await handleOpinion("108432", fixturesDeps(), opinionGuard(opinion, "a"));
    expect(res.status).toBe(200);
  });
});
