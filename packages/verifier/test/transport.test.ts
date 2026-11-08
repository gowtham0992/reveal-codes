import { describe, expect, it } from "vitest";
import type { Deps, FetchInit, HttpResponse } from "../src/deps";
import { buildLookupRequest } from "../src/request";
import {
  requestOnce,
  retryDelayMs,
  waitUntilOf,
  withRetries,
  type Attempted,
  type HttpOutcome,
} from "../src/transport";
import { makeDeps, TEST_BASE_URL, type TestDeps } from "./support/make-deps";
import type { ScriptStep } from "./support/scripted-fetch";

const START = Date.UTC(2026, 0, 1);
const LINE = "410 U.S. 113";

/** In-test stand-in for the recorded `http/throttle-429.json` (task 6.1 replaces it). */
const THROTTLE_BODY = {
  detail: "Request was throttled. Expected available in 20 seconds.",
  wait_until: "2026-01-01T00:00:20.000Z",
};

function once(t: TestDeps): Promise<HttpOutcome> {
  const req = buildLookupRequest(t.deps, [LINE]);
  return requestOnce(t.deps, req.url, req.spec);
}

function retried(t: TestDeps): Promise<Attempted> {
  return withRetries(
    t.deps,
    () => Promise.resolve(true),
    () => once(t),
  );
}

/** Sleeps other than the 15 000 ms request timers. */
function retrySleeps(t: TestDeps): number[] {
  return t.clock.sleeps.filter((ms) => ms !== 15_000);
}

function throttled(headers?: Record<string, string>, body: unknown = {}): ScriptStep {
  return headers === undefined ? { status: 429, body } : { status: 429, headers, body };
}

describe("requestOnce", () => {
  it("returns network when fetch rejects", async () => {
    const t = makeDeps([{ reject: "connection reset" }]);
    expect(await once(t)).toEqual({ kind: "network" });
  });

  it("aborts a request that gets no response in 15 000 ms", async () => {
    const t = makeDeps([{ hang: true }]);
    expect(await once(t)).toEqual({ kind: "timeout" });
    expect(t.clock.sleeps).toEqual([15_000]);
    expect(t.fetch.calls[0]?.signal.aborted).toBe(true);
  });

  it("cancels the 15 s timer when the request settles first", async () => {
    const t = makeDeps([{ status: 200, body: [] }]);
    expect(await once(t)).toEqual({ kind: "json", json: [] });
    expect(t.clock.pending()).toBe(0);
    expect(t.fetch.calls[0]?.signal.aborted).toBe(false);
  });

  it("marks 500 as retryable and 404 as not", async () => {
    const a = makeDeps([{ status: 500, body: {} }]);
    expect(await once(a)).toMatchObject({ kind: "http_error", status: 500, retryable: true });
    const b = makeDeps([{ status: 404, body: {} }]);
    expect(await once(b)).toMatchObject({ kind: "http_error", status: 404, retryable: false });
  });

  it("returns bad_body for a 2xx body that is not JSON", async () => {
    const t = makeDeps([{ status: 200, body: "<html>oops</html>" }]);
    expect(await once(t)).toEqual({ kind: "bad_body" });
  });

  it("asks fetch to treat a redirect as an error, and a redirect failure is network", async () => {
    const t = makeDeps();
    const seen: FetchInit[] = [];
    const deps: Deps = {
      ...t.deps,
      fetch: (_url, init) => {
        seen.push(init);
        return Promise.reject(new TypeError("redirect mode is set to error"));
      },
    };
    const req = buildLookupRequest(deps, [LINE]);
    expect(await requestOnce(deps, req.url, req.spec)).toEqual({ kind: "network" });
    expect(seen[0]?.redirect).toBe("error");
  });

  it("returns network when reading the body fails", async () => {
    const t = makeDeps();
    const res: HttpResponse = {
      status: 200,
      headers: { get: () => null },
      text: () => Promise.reject(new Error("body stream broke")),
    };
    const deps: Deps = { ...t.deps, fetch: () => Promise.resolve(res) };
    const req = buildLookupRequest(deps, [LINE]);
    expect(await requestOnce(deps, req.url, req.spec)).toEqual({ kind: "network" });
  });

  it("returns network when fetch throws synchronously", async () => {
    const t = makeDeps();
    const deps: Deps = {
      ...t.deps,
      fetch: () => {
        throw new Error("sync failure");
      },
    };
    const req = buildLookupRequest(deps, [LINE]);
    expect(await requestOnce(deps, req.url, req.spec)).toEqual({ kind: "network" });
  });
});

describe("auth rule", () => {
  const TOKEN = "s3cret-token-value";

  it("sends the token to the base URL only", async () => {
    const t = makeDeps([{ status: 200, body: [] }, { status: 200, body: [] }], { token: TOKEN });
    const req = buildLookupRequest(t.deps, [LINE]);
    await requestOnce(t.deps, req.url, req.spec);
    await requestOnce(t.deps, "https://evil.test/api/rest/v4/opinions/1/", {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    expect(t.fetch.calls[0]?.headers["Authorization"]).toBe(`Token ${TOKEN}`);
    expect(t.fetch.calls[1]?.headers["Authorization"]).toBeUndefined();
  });

  it("never puts the token in an outcome", async () => {
    const steps: ScriptStep[] = [
      { status: 200, body: [{ status: 404 }] },
      { status: 500, body: {} },
      { status: 200, body: "not json" },
      { reject: "down" },
    ];
    const t = makeDeps(steps, { token: TOKEN });
    for (let i = 0; i < steps.length; i++) {
      expect(JSON.stringify(await once(t))).not.toContain(TOKEN);
    }
  });
});

describe("retryDelayMs", () => {
  const err = (retryAfter: string | null, waitUntil: string | null): HttpOutcome => ({
    kind: "http_error",
    status: 429,
    retryable: true,
    retryAfter,
    waitUntil,
  });

  it("reads Retry-After as integer seconds", () => {
    expect(retryDelayMs(err("7", null), START)).toBe(7_000);
  });

  it("reads Retry-After as an HTTP date", () => {
    expect(retryDelayMs(err("Thu, 01 Jan 2026 00:00:05 GMT", null), START)).toBe(5_000);
  });

  it("falls back to 1 000 ms for a garbage Retry-After and no wait_until", () => {
    expect(retryDelayMs(err("soon", null), START)).toBe(1_000);
    expect(retryDelayMs(err(null, null), START)).toBe(1_000);
  });

  it("uses the larger hint when both are present", () => {
    expect(retryDelayMs(err("3", "2026-01-01T00:00:09.000Z"), START)).toBe(9_000);
    expect(retryDelayMs(err("12", "2026-01-01T00:00:09.000Z"), START)).toBe(12_000);
  });

  it("never goes below 0 for a wait_until in the past and caps at 30 000", () => {
    expect(retryDelayMs(err(null, "2025-12-31T00:00:00.000Z"), START)).toBe(0);
    expect(retryDelayMs(err("600", null), START)).toBe(30_000);
  });
});

describe("withRetries", () => {
  it("does not retry a 404", async () => {
    const t = makeDeps([{ status: 404, body: {} }]);
    const r = await retried(t);
    expect(r.attempts).toBe(1);
    expect(t.fetch.calls).toHaveLength(1);
    expect(retrySleeps(t)).toEqual([]);
  });

  it("does not retry a network failure, a timeout or a bad body", async () => {
    for (const step of [{ reject: "x" }, { hang: true }, { status: 200, body: "nope" }] as const) {
      const t = makeDeps([step]);
      expect((await retried(t)).attempts).toBe(1);
      expect(t.fetch.calls).toHaveLength(1);
    }
  });

  it("retries a 429 after the Retry-After seconds and then succeeds", async () => {
    const t = makeDeps([throttled({ "Retry-After": "4" }), { status: 200, body: [] }]);
    const r = await retried(t);
    expect(r).toEqual({ outcome: { kind: "json", json: [] }, attempts: 2 });
    expect(retrySleeps(t)).toEqual([4_000]);
  });

  it("retries after an HTTP-date Retry-After", async () => {
    const t = makeDeps(
      [throttled({ "Retry-After": "Thu, 01 Jan 2026 00:00:06 GMT" }), { status: 200, body: [] }],
      { startMs: START },
    );
    await retried(t);
    expect(retrySleeps(t)).toEqual([6_000]);
  });

  it("sleeps 1 000 ms for a garbage Retry-After", async () => {
    const t = makeDeps([throttled({ "Retry-After": "later" }), { status: 200, body: [] }]);
    await retried(t);
    expect(retrySleeps(t)).toEqual([1_000]);
  });

  it("reads wait_until from the body", async () => {
    const t = makeDeps([throttled(undefined, THROTTLE_BODY), { status: 200, body: [] }]);
    await retried(t);
    expect(retrySleeps(t)).toEqual([20_000]);
  });

  it("reads the misspelt wait_util too", async () => {
    const body = { wait_util: "2026-01-01T00:00:08.000Z" };
    const t = makeDeps([throttled(undefined, body), { status: 200, body: [] }]);
    await retried(t);
    expect(retrySleeps(t)).toEqual([8_000]);
  });

  it("stops after three attempts and keeps the last waitUntil", async () => {
    const bodies = [
      { wait_until: "2026-01-01T00:00:03.000Z" },
      { wait_until: "2026-01-01T00:00:04.000Z" },
      { wait_until: "2026-01-01T00:00:05.000Z" },
    ];
    const t = makeDeps(bodies.map((b) => throttled(undefined, b)));
    const r = await retried(t);
    expect(r.attempts).toBe(3);
    expect(t.fetch.calls).toHaveLength(3);
    // wait_until is absolute: after the 3 s sleep, 4 s from the start is 1 s away.
    expect(retrySleeps(t)).toEqual([3_000, 1_000]);
    expect(waitUntilOf(r.outcome, START)).toBe("2026-01-01T00:00:05.000Z");
  });

  it("replays the throttle body three times and ends unchecked with its waitUntil", async () => {
    const t = makeDeps([1, 2, 3].map(() => throttled({ "Retry-After": "2" }, THROTTLE_BODY)));
    const r = await retried(t);
    expect(r.attempts).toBe(3);
    expect(waitUntilOf(r.outcome, START)).toBe("2026-01-01T00:00:20.000Z");
  });

  it("falls back to Retry-After for waitUntil and omits it when neither is present", async () => {
    const a = makeDeps([1, 2, 3].map(() => throttled({ "Retry-After": "9" })));
    expect(waitUntilOf((await retried(a)).outcome, START)).toBe("2026-01-01T00:00:09.000Z");
    const b = makeDeps([1, 2, 3].map(() => ({ status: 503, body: {} })));
    expect(waitUntilOf((await retried(b)).outcome, START)).toBeNull();
  });

  it("gives no waitUntil for network, timeout, bad body or a non-retryable status", async () => {
    expect(waitUntilOf({ kind: "network" }, START)).toBeNull();
    expect(waitUntilOf({ kind: "timeout" }, START)).toBeNull();
    expect(waitUntilOf({ kind: "bad_body" }, START)).toBeNull();
    const nf = makeDeps([{ status: 404, body: THROTTLE_BODY }]);
    expect(waitUntilOf((await retried(nf)).outcome, START)).toBeNull();
  });

  it("calls before() ahead of every attempt and stops when it declines", async () => {
    const t = makeDeps([throttled(), throttled(), throttled()]);
    let calls = 0;
    const r = await withRetries(
      t.deps,
      () => Promise.resolve(++calls <= 1),
      () => once(t),
    );
    expect(calls).toBe(2);
    expect(r).toEqual({ outcome: { kind: "network" }, attempts: 1 });
    expect(t.fetch.calls).toHaveLength(1);
  });

  it("uses only the base URL for lookup requests", async () => {
    const t = makeDeps([{ status: 200, body: [] }]);
    await once(t);
    expect(t.fetch.calls[0]?.url).toBe(`${TEST_BASE_URL}/citation-lookup/`);
  });
});
