import { describe, expect, it } from "vitest";
import type { FetchInit } from "@reveal-codes/verifier";
import { recordedFetch, throttleFetch } from "./support/recorded-fetch";
import { testDeps, testSleep, throwOnceDeps } from "./support/test-deps";

const URL_BASE = "https://www.courtlistener.com/api/rest/v4";

function init(method: "GET" | "POST", body?: string): FetchInit {
  const base = {
    method,
    headers: {},
    signal: new AbortController().signal,
    redirect: "error",
  } as const;
  return body === undefined ? base : { ...base, body };
}

describe("recordedFetch and test deps _Requirements: 12.2, 12.3, 12.9, 12.19_", () => {
  it("answers a recorded lookup", async () => {
    const { fetch, misses } = recordedFetch();
    const body = new URLSearchParams({ text: "556 U.S. 662" }).toString();
    const res = await fetch(`${URL_BASE}/citation-lookup/`, init("POST", body));
    const parsed = JSON.parse(await res.text()) as { status: number }[];
    expect(res.status).toBe(200);
    expect(parsed[0]?.status).toBe(200);
    expect(misses).toEqual([]);
  });

  it("throws on an unrecorded request, naming it, and records the miss", () => {
    const { fetch, misses } = recordedFetch({ failOnMiss: false });
    const body = new URLSearchParams({ text: "1 U.S. 1\n556 U.S. 662" }).toString();
    expect(() => fetch(`${URL_BASE}/citation-lookup/`, init("POST", body))).toThrow(
      /unrecorded request: POST .*citation-lookup.* \[1 U\.S\. 1, 556 U\.S\. 662\]/,
    );
    expect(() => fetch(`${URL_BASE}/opinions/1/`, init("GET"))).toThrow(/opinions\/1/);
    expect(misses).toHaveLength(2);
    expect(misses[1]).toBe(`GET ${URL_BASE}/opinions/1/ []`);
  });

  it("throttleFetch answers 429 with Retry-After 30", async () => {
    const res = await throttleFetch()(`${URL_BASE}/citation-lookup/`, init("POST", "text=x"));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(JSON.parse(await res.text())).toMatchObject({ wait_until: "2026-11-02T12:00:30Z" });
  });

  it("testSleep resolves at once without a signal and on abort with one", async () => {
    await testSleep(60_000);
    const controller = new AbortController();
    let settled = false;
    const pending = testSleep(60_000, controller.signal).then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    controller.abort();
    await pending;
    expect(settled).toBe(true);
  });

  it("throwOnceDeps throws on the first fetch read and not on the second", () => {
    const base = testDeps(recordedFetch({ failOnMiss: false }).fetch);
    const deps = throwOnceDeps(base);
    expect(() => deps.fetch).toThrow(/injected failure/);
    expect(deps.fetch).toBe(base.fetch);
    expect(deps.baseUrl).toBe(base.baseUrl);
  });
});
