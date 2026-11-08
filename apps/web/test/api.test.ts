import { describe, expect, it } from "vitest";
import { createApiClient } from "../src/client/api";
import type { FetchFn } from "../src/client/api";
import { demoRecords } from "./support/route-deps";
import { routeFetch } from "./support/route-fetch";

const json = (body: unknown, status = 200): Promise<Response> =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe("Api client _Requirements: 17.1, 17.2_", () => {
  it("verify posts { records } as JSON and returns the five demo pairs", async () => {
    const server = routeFetch();
    const records = demoRecords();
    const result = await createApiClient(server.fetch).verify(records);
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]?.method).toBe("POST");
    expect(JSON.parse(server.requests[0]?.body ?? "")).toEqual({ records });
    expect(result.ok && result.value.length).toBe(records.length);
  });

  it("drops malformed pairs and keeps the good ones", async () => {
    const fetchFn: FetchFn = () =>
      json([
        ["k0", { status: "not_found" }],
        ["k1"],
        [5, { status: "verified" }],
        ["k2", { status: "verified" }],
        "x",
      ]);
    const result = await createApiClient(fetchFn).verify([]);
    expect(result).toEqual({ ok: true, value: [["k0", { status: "not_found" }]] });
  });

  it("a non-array verify body is a shape error", async () => {
    const result = await createApiClient(() => json({ a: 1 })).verify([]);
    expect(result).toEqual({ ok: false, error: { kind: "shape" } });
  });

  it("a rejected fetch is a network error and a 5xx is a status error", async () => {
    const down = createApiClient(() => Promise.reject(new Error("offline")));
    expect(await down.verify([])).toEqual({ ok: false, error: { kind: "network" } });
    const bad = createApiClient(() => json({}, 503));
    expect(await bad.mode()).toEqual({ ok: false, error: { kind: "status", status: 503 } });
  });

  it("opinion is a body-less GET and text null is a value", async () => {
    const server = routeFetch();
    const api = createApiClient(server.fetch);
    expect(await api.opinion("999999999")).toEqual({ ok: true, value: null });
    expect(server.requests[0]).toEqual({
      url: "/api/opinion/999999999",
      method: "GET",
      body: null,
    });
  });

  it("opinion with a malformed body is a shape error", async () => {
    const result = await createApiClient(() => json({ text: 5 })).opinion("1");
    expect(result).toEqual({ ok: false, error: { kind: "shape" } });
  });

  it("mode and demoMotion are read", async () => {
    const api = createApiClient(routeFetch().fetch);
    expect(await api.mode()).toEqual({ ok: false, error: { kind: "status", status: 404 } });
    const motion = await api.demoMotion();
    expect(motion.ok && motion.value).toContain("Iqbal");
    const mode = await createApiClient(() => json({ mode: "fixtures" })).mode();
    expect(mode).toEqual({ ok: true, value: { mode: "fixtures" } });
  });
});
