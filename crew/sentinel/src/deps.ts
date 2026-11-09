import { join } from "node:path";
import {
  createDeps,
  createFileCacheStore,
  createFixtureFetch,
  createMemoryCacheStore,
} from "@reveal-codes/verifier";
import type { Deps, FetchLike } from "@reveal-codes/verifier";
import type { Clock, Mode } from "./types.js";

export type SentinelEnv = Readonly<Record<string, string | undefined>>;

export type SentinelConfig = Readonly<{
  mode: Mode;
  /** Non-null only in live mode. Never logged or written to a report. */
  token: string | null;
  baseUrl: string;
  /** `null` means `<home>/.reveal-codes/cache`. */
  cacheDir: string | null;
}>;

export type SentinelIo = Readonly<{
  fetch: FetchLike;
  now: Clock;
  sleep: Deps["sleep"];
  homeDir: string;
}>;

export const DEFAULT_BASE_URL = "https://www.courtlistener.com/api/rest/v4";

function nonEmpty(value: string | undefined): string | null {
  return value === undefined || value === "" ? null : value;
}

/** Pure: live when a token is present and fixtures-only is not exactly `1`. Reads four names only. */
export function readSentinelConfig(env: SentinelEnv): SentinelConfig {
  const token = nonEmpty(env["COURTLISTENER_TOKEN"]);
  const live = token !== null && env["REVEAL_CODES_FIXTURES_ONLY"] !== "1";
  return {
    mode: live ? "live" : "fixtures",
    token: live ? token : null,
    baseUrl: nonEmpty(env["COURTLISTENER_BASE_URL"]) ?? DEFAULT_BASE_URL,
    cacheDir: nonEmpty(env["REVEAL_CODES_CACHE_DIR"]),
  };
}

/** Depends on `env` and `io` alone. Fixtures use recorded responses only. */
export function buildDeps(env: SentinelEnv, io: SentinelIo): Readonly<{ mode: Mode; deps: Deps }> {
  const config = readSentinelConfig(env);
  const base = { now: io.now, sleep: io.sleep, baseUrl: config.baseUrl };
  if (config.mode === "fixtures" || config.token === null) {
    const deps = createDeps({
      ...base,
      fetch: createFixtureFetch(),
      cache: createMemoryCacheStore({ now: io.now }),
    });
    return { mode: "fixtures", deps };
  }
  const dir = config.cacheDir ?? join(io.homeDir, ".reveal-codes", "cache");
  const deps = createDeps({
    ...base,
    fetch: io.fetch,
    cache: createFileCacheStore({ dir, now: io.now }),
    token: config.token,
  });
  return { mode: "live", deps };
}
