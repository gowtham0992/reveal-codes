import { afterEach, describe, expect, it, vi } from "vitest";
import type { FetchInit, FetchLike, HttpResponse } from "@reveal-codes/verifier";
import { buildServerDeps, DEFAULT_BASE_URL, readServerConfig, realSleep } from "../src/server/deps";
import type { ServerConfig, ServerIo } from "../src/server/deps";

const SENTINEL = "SENTINEL-TOKEN-do-not-leak-7f3a";
const FIXED = new Date("2026-11-07T00:00:00Z");

type Call = Readonly<{ url: string; init: FetchInit }>;

function scriptedFetch(calls: Call[]): FetchLike {
  return (url, init) => {
    calls.push({ url, init });
    const res: HttpResponse = {
      status: 200,
      headers: { get: () => "application/json" },
      text: () => Promise.resolve("[]"),
    };
    return Promise.resolve(res);
  };
}

function ioWith(fetchLike: FetchLike): ServerIo {
  return { fetch: fetchLike, now: () => FIXED, sleep: realSleep, homeDir: "/home/nobody" };
}

function initOf(body: string): FetchInit {
  return {
    method: "POST",
    headers: {},
    body,
    signal: new AbortController().signal,
    redirect: "error",
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("readServerConfig", () => {
  const cases: ReadonlyArray<
    readonly [string, Record<string, string | undefined>, ServerConfig["mode"], string | null]
  > = [
    ["token absent", {}, "fixtures", null],
    ["token empty", { COURTLISTENER_TOKEN: "" }, "fixtures", null],
    ["token present", { COURTLISTENER_TOKEN: SENTINEL }, "live", SENTINEL],
    [
      "fixtures-only wins over a token",
      { COURTLISTENER_TOKEN: SENTINEL, REVEAL_CODES_FIXTURES_ONLY: "1" },
      "fixtures",
      null,
    ],
    [
      "fixtures-only other than 1 is ignored",
      { COURTLISTENER_TOKEN: SENTINEL, REVEAL_CODES_FIXTURES_ONLY: "0" },
      "live",
      SENTINEL,
    ],
  ];
  for (const [name, env, mode, token] of cases) {
    it(`${name}: mode ${mode}`, () => {
      const config = readServerConfig(env);
      expect(config.mode).toBe(mode);
      expect(config.token).toBe(token);
    });
  }

  it("defaults baseUrl and cacheDir", () => {
    const config = readServerConfig({});
    expect(config.baseUrl).toBe(DEFAULT_BASE_URL);
    expect(config.cacheDir).toBeNull();
  });

  it("reads overrides for baseUrl and cacheDir", () => {
    const config = readServerConfig({
      COURTLISTENER_BASE_URL: "https://example.test/api",
      REVEAL_CODES_CACHE_DIR: "/tmp/rc-cache",
    });
    expect(config.baseUrl).toBe("https://example.test/api");
    expect(config.cacheDir).toBe("/tmp/rc-cache");
  });

  it("reads the assistant pairs and treats empty as absent (Tier 2)", () => {
    expect(readServerConfig({}).assistant).toEqual({ bedrock: null, anthropic: null });
    expect(
      readServerConfig({
        AWS_REGION: "us-test-1",
        BEDROCK_MODEL_ID: "bedrock-model",
        ANTHROPIC_API_KEY: "",
        ANTHROPIC_MODEL: "anthropic-model",
      }).assistant,
    ).toEqual({
      bedrock: { region: "us-test-1", modelId: "bedrock-model", roleArn: null },
      anthropic: null,
    });
    expect(
      readServerConfig({ ANTHROPIC_API_KEY: "k", ANTHROPIC_MODEL: "anthropic-model" }).assistant,
    ).toEqual({ bedrock: null, anthropic: { apiKey: "k", modelId: "anthropic-model" } });
  });

  it("reads BEDROCK_ROLE_ARN only as part of a configured Bedrock pair", () => {
    const arn = "arn:aws:iam::123456789012:role/reveal-codes-bedrock";
    const pair = { AWS_REGION: "us-test-1", BEDROCK_MODEL_ID: "bedrock-model" };
    expect(readServerConfig({ ...pair, BEDROCK_ROLE_ARN: arn }).assistant.bedrock?.roleArn).toBe(
      arn,
    );
    expect(
      readServerConfig({ ...pair, BEDROCK_ROLE_ARN: "" }).assistant.bedrock?.roleArn,
    ).toBeNull();
    expect(readServerConfig({ BEDROCK_ROLE_ARN: arn }).assistant.bedrock).toBeNull();
  });
  it("does not echo the token in any field other than token", () => {
    const config = readServerConfig({ COURTLISTENER_TOKEN: SENTINEL });
    const { token, ...rest } = config;
    expect(token).toBe(SENTINEL);
    expect(JSON.stringify(rest)).not.toContain(SENTINEL);
  });
});

describe("buildServerDeps", () => {
  it("fixtures mode makes no network call and carries no token", async () => {
    const calls: Call[] = [];
    const deps = buildServerDeps(
      readServerConfig({ COURTLISTENER_TOKEN: SENTINEL, REVEAL_CODES_FIXTURES_ONLY: "1" }),
      ioWith(scriptedFetch(calls)),
    );
    const res = await deps.fetch(`${DEFAULT_BASE_URL}/citation-lookup/`, initOf("text=1+U.S.+1"));
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(0);
    expect(deps.token).toBeUndefined();
    expect(JSON.stringify(deps)).not.toContain(SENTINEL);
  });

  it("live mode uses the supplied fetch and holds the token only in Deps", async () => {
    const calls: Call[] = [];
    const config = readServerConfig({
      COURTLISTENER_TOKEN: SENTINEL,
      REVEAL_CODES_CACHE_DIR: "/tmp/rc-test-cache-unused",
    });
    const deps = buildServerDeps(config, ioWith(scriptedFetch(calls)));
    await deps.fetch("https://example.test/x", initOf("text=a"));
    expect(calls).toHaveLength(1);
    expect(deps.token).toBe(SENTINEL);
    expect(deps.baseUrl).toBe(DEFAULT_BASE_URL);
  });

  it("an Error built from config text never contains the token", () => {
    const config = readServerConfig({ COURTLISTENER_TOKEN: SENTINEL });
    const safe = { mode: config.mode, baseUrl: config.baseUrl, cacheDir: config.cacheDir };
    expect(String(new Error(`bad config ${JSON.stringify(safe)}`))).not.toContain(SENTINEL);
  });
});

describe("production sleep is a real abortable timer (both modes)", () => {
  const configs: ReadonlyArray<readonly [string, Record<string, string>]> = [
    ["fixtures", {}],
    ["live", { COURTLISTENER_TOKEN: SENTINEL }],
  ];
  for (const [name, env] of configs) {
    it(`${name}: sleep(15000) does not beat a 50 ms real timer`, async () => {
      const deps = buildServerDeps(readServerConfig(env), ioWith(scriptedFetch([])));
      const cancel = new AbortController();
      const slept = deps.sleep(15_000, cancel.signal).then(() => "sleep" as const);
      const timer = new Promise<"timer">((resolve) => {
        setTimeout(() => {
          resolve("timer");
        }, 50);
      });
      const winner = await Promise.race([slept, timer]);
      cancel.abort();
      await slept;
      expect(winner).toBe("timer");
    });

    it(`${name}: an aborted sleep resolves and clears its timer`, async () => {
      const deps = buildServerDeps(readServerConfig(env), ioWith(scriptedFetch([])));
      const clear = vi.spyOn(globalThis, "clearTimeout");
      const cancel = new AbortController();
      const slept = deps.sleep(15_000, cancel.signal);
      cancel.abort();
      await slept;
      expect(clear).toHaveBeenCalledTimes(1);
    });
  }

  it("resolves after roughly the requested delay", async () => {
    const start = performance.now();
    await realSleep(40);
    expect(performance.now() - start).toBeGreaterThanOrEqual(30);
  });

  it("an already-aborted signal resolves without arming a timer", async () => {
    const set = vi.spyOn(globalThis, "setTimeout");
    const cancel = new AbortController();
    cancel.abort();
    await realSleep(15_000, cancel.signal);
    expect(set).not.toHaveBeenCalled();
  });
});
