import { describe, expect, it } from "vitest";
import { handleAssistant } from "../src/server/assistant-route";
import type { AssistantConfig } from "../src/server/deps";
import {
  ASSISTANT_LIMIT,
  ASSISTANT_WINDOW_MS,
  LOCAL_ADDRESS,
  clientAddress,
  createFixedWindowLimiter,
} from "../src/server/rate-limit";
import type { Limiter } from "../src/server/rate-limit";
const BUSY = "The assistant is busy. Try again in a few minutes.";
const LIVE: AssistantConfig = { bedrock: null, anthropic: { apiKey: "k-not-real", modelId: "m" } };
const NONE: AssistantConfig = { bedrock: null, anthropic: null };
function clock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number): void => {
      t += ms;
    },
  };
}
function limiterWith(c: { now: () => number }): Limiter {
  return createFixedWindowLimiter({ limit: 10, windowMs: ASSISTANT_WINDOW_MS, now: c.now });
}
async function* oneChunk(): AsyncGenerator<string, void, undefined> {
  await Promise.resolve();
  yield "ok";
}
const OPTIONS = {
  streamText: () => ({ textStream: oneChunk() }),
  adapters: { anthropic: oneChunk },
};
function post(address?: string): Request {
  return new Request("http://localhost/api/assistant", {
    method: "POST",
    body: JSON.stringify({ prompt: "p", context: "" }),
    ...(address === undefined ? {} : { headers: { "x-forwarded-for": address } }),
  });
}
const call = (limiter: Limiter, config: AssistantConfig, address?: string): Promise<Response> =>
  handleAssistant(post(address), config, OPTIONS, limiter);
describe("assistant limits", () => {
  it("are 10 requests per 10 minutes", () => {
    expect(ASSISTANT_LIMIT).toBe(10);
    expect(ASSISTANT_WINDOW_MS).toBe(600_000);
  });
});
describe("clientAddress", () => {
  it("takes the first x-forwarded-for entry and falls back to local", () => {
    const h = (v?: string): Headers => new Headers(v === undefined ? {} : { "x-forwarded-for": v });
    expect(clientAddress(h("203.0.113.9, 10.0.0.1, 10.0.0.2"))).toBe("203.0.113.9");
    expect(clientAddress(h("  198.51.100.4  "))).toBe("198.51.100.4");
    expect(clientAddress(h())).toBe(LOCAL_ADDRESS);
    expect(clientAddress(h(""))).toBe(LOCAL_ADDRESS);
    expect(LOCAL_ADDRESS).toBe("local");
  });
});
describe("/api/assistant limiter", () => {
  it("passes the tenth request and answers the eleventh with 429, Retry-After and the fixed message", async () => {
    const c = clock();
    const limiter = limiterWith(c);
    for (let i = 1; i <= 10; i += 1) {
      const res = await call(limiter, LIVE, "203.0.113.9");
      expect(res.status, `request ${String(i)}`).toBe(200);
      await res.text();
    }
    c.advance(60_000);
    const refused = await call(limiter, LIVE, "203.0.113.9");
    expect(refused.status).toBe(429);
    expect(refused.headers.get("Retry-After")).toBe("540");
    expect(await refused.json()).toEqual({ error: BUSY });
  });
  it("passes again in a new window", async () => {
    const c = clock();
    const limiter = limiterWith(c);
    for (let i = 0; i < 11; i += 1) await (await call(limiter, LIVE, "a")).text();
    c.advance(ASSISTANT_WINDOW_MS);
    const res = await call(limiter, LIVE, "a");
    expect(res.status).toBe(200);
    await res.text();
  });
  it("counts each address on its own", async () => {
    const limiter = limiterWith(clock());
    for (let i = 0; i < 10; i += 1) await (await call(limiter, LIVE, "a")).text();
    expect((await call(limiter, LIVE, "a")).status).toBe(429);
    const other = await call(limiter, LIVE, "b");
    expect(other.status).toBe(200);
    await other.text();
  });
  it("counts requests without the header under local", async () => {
    const limiter = limiterWith(clock());
    for (let i = 0; i < 10; i += 1) await (await call(limiter, LIVE)).text();
    expect((await call(limiter, LIVE)).status).toBe(429);
  });
  it("never limits the fixture provider", async () => {
    const limiter = limiterWith(clock());
    for (let i = 0; i < 25; i += 1) {
      const res = await handleAssistant(post("a"), NONE, {}, limiter);
      expect(res.status, `request ${String(i + 1)}`).toBe(200);
      await res.text();
    }
  });
  it("does not spend a request on a fixture-provider call", async () => {
    const limiter = limiterWith(clock());
    for (let i = 0; i < 12; i += 1)
      await (await handleAssistant(post("a"), NONE, {}, limiter)).text();
    const res = await call(limiter, LIVE, "a");
    expect(res.status).toBe(200);
    await res.text();
  });
});
