import {
  createDeps,
  createFileCacheStore,
  createFixtureFetch,
  createMemoryCacheStore,
} from "@reveal-codes/verifier";
import type { Deps, FetchLike } from "@reveal-codes/verifier";
import type { Env } from "./env";
import { createLog } from "./log";
import type { Log } from "./log";

export const BASE_URL = "https://www.courtlistener.com/api/rest/v4";

/** Where answers come from: recorded fixtures, CourtListener with a token, or CourtListener without one. */
export type Mode = "fixtures" | "live" | "live_without_token";
/** What every tool handler receives. */
export type ToolContext = Readonly<{
  mode: Mode;
  deps: Deps;
  now: () => Date;
  /** Redacts the token and writes to stderr unless a sink was given to `buildContext`. */
  log: Log;
  /** Stops redaction from being bypassed: error text passes through this before leaving. */
  scrub: (text: string) => string;
}>;

/** A `setTimeout` promise: unref'd, and cleared when `signal` aborts (design A14). */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted === true) {
      resolve();
      return;
    }
    const finish = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    timer.unref();
    signal?.addEventListener("abort", finish, { once: true });
  });
}

const globalFetch: FetchLike = (url, init) => fetch(url, init);

function depsFor(env: Env, now: () => Date): Deps {
  const base = { now, sleep, baseUrl: BASE_URL };
  const withToken = env.token === undefined ? base : { ...base, token: env.token };
  if (env.fixturesOnly) {
    return createDeps({
      ...withToken,
      fetch: createFixtureFetch(),
      cache: createMemoryCacheStore({ now }),
    });
  }
  return createDeps({
    ...withToken,
    fetch: globalFetch,
    cache: createFileCacheStore({ dir: env.cacheDir, now }),
  });
}

/** Builds the one `Deps` the server uses (Req 11.5, 13.11). */
export function buildContext(env: Env, sink?: (line: string) => void): ToolContext {
  const now = (): Date => new Date();
  const log = sink === undefined ? createLog(env.token) : createLog(env.token, sink);
  const scrub = (text: string): string =>
    env.token === undefined ? text : text.split(env.token).join("[redacted]");
  const mode: Mode = env.fixturesOnly
    ? "fixtures"
    : env.token === undefined
      ? "live_without_token"
      : "live";
  return { mode, deps: depsFor(env, now), now, log, scrub };
}
