import { homedir } from "node:os";
import { join } from "node:path";
import {
  createDeps,
  createFileCacheStore,
  createFixtureFetch,
  createMemoryCacheStore,
} from "@reveal-codes/verifier";
import type { Deps, FetchLike } from "@reveal-codes/verifier";

// This module is the only reader of process.env in apps/web (Req 15.1).
export type ServerEnv = Readonly<Record<string, string | undefined>>;

export type ServerMode = "fixtures" | "live";

export type ServerConfig = Readonly<{
  mode: ServerMode;
  /** Non-null only in live mode. Never logged, returned or sent to the browser. */
  token: string | null;
  baseUrl: string;
  /** `null` means `<home>/.reveal-codes/cache`. */
  cacheDir: string | null;
}>;

export type ServerIo = Readonly<{
  fetch: FetchLike;
  now: () => Date;
  sleep: Deps["sleep"];
  homeDir: string;
}>;

export const DEFAULT_BASE_URL = "https://www.courtlistener.com/api/rest/v4";

function nonEmpty(value: string | undefined): string | null {
  return value === undefined || value === "" ? null : value;
}

/** Pure: the Mode is `fixtures` unless a token is present and fixtures-only is not `1`. */
export function readServerConfig(env: ServerEnv): ServerConfig {
  const token = nonEmpty(env["COURTLISTENER_TOKEN"]);
  const live = token !== null && env["REVEAL_CODES_FIXTURES_ONLY"] !== "1";
  return {
    mode: live ? "live" : "fixtures",
    token: live ? token : null,
    baseUrl: nonEmpty(env["COURTLISTENER_BASE_URL"]) ?? DEFAULT_BASE_URL,
    cacheDir: nonEmpty(env["REVEAL_CODES_CACHE_DIR"]),
  };
}

/**
 * A real, abortable timer. The Verifier races every request against
 * `sleep(15000)`; an instantly resolving sleep would win every race. Abort
 * clears the timer and resolves, so the loser of a race leaves nothing behind.
 */
export function realSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal?.aborted === true) {
      resolve();
      return;
    }
    const timer = setTimeout(done, ms);
    timer.unref();
    function done(): void {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }
    function onAbort(): void {
      clearTimeout(timer);
      done();
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Live uses the supplied fetch, a file cache and the token; fixtures use recorded responses only. */
export function buildServerDeps(config: ServerConfig, io: ServerIo): Deps {
  const base = { now: io.now, sleep: io.sleep, baseUrl: config.baseUrl };
  if (config.mode === "fixtures" || config.token === null) {
    return createDeps({
      ...base,
      fetch: createFixtureFetch(),
      cache: createMemoryCacheStore({ now: io.now }),
    });
  }
  const dir = config.cacheDir ?? join(io.homeDir, ".reveal-codes", "cache");
  return createDeps({
    ...base,
    fetch: io.fetch,
    cache: createFileCacheStore({ dir, now: io.now }),
    token: config.token,
  });
}

export type ServerContext = Readonly<{ config: ServerConfig; deps: Deps }>;

const CONTEXT_KEY = Symbol.for("reveal-codes.server-context");
type Holder = { [CONTEXT_KEY]?: ServerContext };

/** One context per process, kept on `globalThis` so dev hot reload keeps the bucket and cache. */
export function getServerContext(): ServerContext {
  const holder = globalThis as Holder;
  const existing = holder[CONTEXT_KEY];
  if (existing !== undefined) return existing;
  const config = readServerConfig(process.env);
  const io: ServerIo = {
    fetch: (url, init) => fetch(url, init),
    now: () => new Date(),
    sleep: realSleep,
    homeDir: homedir(),
  };
  const context: ServerContext = { config, deps: buildServerDeps(config, io) };
  holder[CONTEXT_KEY] = context;
  return context;
}
