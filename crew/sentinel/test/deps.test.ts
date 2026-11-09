import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifierStatus } from "@reveal-codes/verifier";
import type { FetchLike } from "@reveal-codes/verifier";
import { DEFAULT_BASE_URL, buildDeps, readSentinelConfig } from "../src/deps.js";
import type { SentinelIo } from "../src/deps.js";
import { redact } from "../src/redact.js";
import { realSleep } from "../src/sleep.js";
import { FIXED_NOW, testSleep } from "./support/test-deps";

const TOKEN = "tok-abc123-secret";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), "sentinel-deps-"));
  dirs.push(d);
  return d;
}

function makeIo(fetch: FetchLike, homeDir: string): SentinelIo {
  return { fetch, now: () => FIXED_NOW, sleep: testSleep, homeDir };
}

const unusedFetch: FetchLike = () => {
  throw new Error("unexpected fetch");
};

describe("readSentinelConfig mode table _Requirements: 7.1, 7.2, 7.3, 7.4_", () => {
  const cases: [string, Record<string, string | undefined>, "fixtures" | "live"][] = [
    ["token absent", {}, "fixtures"],
    ["token empty", { COURTLISTENER_TOKEN: "" }, "fixtures"],
    [
      "token, fixtures-only 1",
      { COURTLISTENER_TOKEN: TOKEN, REVEAL_CODES_FIXTURES_ONLY: "1" },
      "fixtures",
    ],
    [
      "token, fixtures-only 0",
      { COURTLISTENER_TOKEN: TOKEN, REVEAL_CODES_FIXTURES_ONLY: "0" },
      "live",
    ],
    ["token, fixtures-only absent", { COURTLISTENER_TOKEN: TOKEN }, "live"],
  ];
  it.each(cases)("%s", (_name, env, mode) => {
    const config = readSentinelConfig(env);
    expect(config.mode).toBe(mode);
    expect(config.token).toBe(mode === "live" ? TOKEN : null);
  });

  it("uses the default base URL and a null cache dir unless set", () => {
    expect(readSentinelConfig({})).toMatchObject({ baseUrl: DEFAULT_BASE_URL, cacheDir: null });
    expect(
      readSentinelConfig({
        COURTLISTENER_BASE_URL: "http://x.test/v4",
        REVEAL_CODES_CACHE_DIR: "/c",
      }),
    ).toMatchObject({ baseUrl: "http://x.test/v4", cacheDir: "/c" });
    expect(readSentinelConfig({ COURTLISTENER_BASE_URL: "" }).baseUrl).toBe(DEFAULT_BASE_URL);
  });
});

describe("buildDeps _Requirements: 7.5, 7.6, 7.7, 7.9, 12.13_", () => {
  it("fixtures mode never calls the injected fetch and holds no token", () => {
    const { mode, deps } = buildDeps(
      { COURTLISTENER_TOKEN: TOKEN, REVEAL_CODES_FIXTURES_ONLY: "1" },
      makeIo(unusedFetch, tempDir()),
    );
    expect(mode).toBe("fixtures");
    expect(deps.token).toBeUndefined();
    expect(JSON.stringify(verifierStatus(deps))).not.toContain(TOKEN);
  });

  it("live mode uses the injected fetch and the token", () => {
    const fetch: FetchLike = unusedFetch;
    const { mode, deps } = buildDeps({ COURTLISTENER_TOKEN: TOKEN }, makeIo(fetch, tempDir()));
    expect(mode).toBe("live");
    expect(deps.fetch).toBe(fetch);
    expect(deps.token).toBe(TOKEN);
    expect(JSON.stringify(verifierStatus(deps))).not.toContain(TOKEN);
  });

  it("live mode caches in REVEAL_CODES_CACHE_DIR, else under <home>/.reveal-codes/cache", async () => {
    const home = tempDir();
    const custom = join(tempDir(), "cache");
    const expires = "2030-01-01T00:00:00.000Z";
    const a = buildDeps(
      { COURTLISTENER_TOKEN: TOKEN, REVEAL_CODES_CACHE_DIR: custom },
      makeIo(unusedFetch, home),
    );
    await a.deps.cache.set("k1", { v: 1 }, expires);
    expect(readdirSync(custom).length).toBeGreaterThan(0);
    expect(existsSync(join(home, ".reveal-codes"))).toBe(false);
    const b = buildDeps({ COURTLISTENER_TOKEN: TOKEN }, makeIo(unusedFetch, home));
    await b.deps.cache.set("k2", { v: 2 }, expires);
    expect(readdirSync(join(home, ".reveal-codes", "cache")).length).toBeGreaterThan(0);
  });

  it("uses COURTLISTENER_BASE_URL when non-empty", () => {
    const { deps } = buildDeps(
      { COURTLISTENER_BASE_URL: "http://x.test/v4" },
      makeIo(unusedFetch, tempDir()),
    );
    expect(deps.baseUrl).toBe("http://x.test/v4");
  });

  it("a crash message passed through redact carries no token", () => {
    const message = `request failed with Authorization: Token ${TOKEN}`;
    expect(redact(message, TOKEN)).not.toContain(TOKEN);
  });
});

describe("realSleep _Requirements: 7.9_", () => {
  it("does not resolve before a short real timer, and resolves on abort", async () => {
    const controller = new AbortController();
    const order: string[] = [];
    const sleeping = realSleep(15000, controller.signal).then(() => order.push("sleep"));
    await new Promise((r) => setTimeout(r, 50));
    order.push("timer");
    controller.abort();
    await sleeping;
    expect(order).toEqual(["timer", "sleep"]);
  });

  it("resolves at once for an already aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(realSleep(15000, controller.signal)).resolves.toBeUndefined();
  });
});
