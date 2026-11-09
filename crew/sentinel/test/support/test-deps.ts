import { createDeps, createMemoryCacheStore } from "@reveal-codes/verifier";
import type { Deps, FetchLike } from "@reveal-codes/verifier";

export const FIXED_NOW = new Date("2026-11-20T18:30:00.000Z");

// Task 2.3 switches this to DEFAULT_BASE_URL from src/deps.ts.
const TEST_BASE_URL = "https://www.courtlistener.com/api/rest/v4";

/**
 * Resolves at once without a signal (the retry delay). With a signal it is a real timer that
 * also resolves on abort, because an instant timeout sleep would win every 15 s race.
 */
export function testSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal === undefined) return Promise.resolve();
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const done = (): void => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done);
  });
}

export function testDeps(fetch: FetchLike): Deps {
  const now = (): Date => FIXED_NOW;
  return createDeps({
    fetch,
    now,
    sleep: testSleep,
    cache: createMemoryCacheStore({ now }),
    baseUrl: TEST_BASE_URL,
  });
}

function withFetchGetter(deps: Deps, get: () => FetchLike): Deps {
  const descriptors = Object.getOwnPropertyDescriptors(deps);
  return Object.defineProperties({}, { ...descriptors, fetch: { get, enumerable: true } }) as Deps;
}

/** A copy of `deps` whose `fetch` throws on every read. */
export function throwingDeps(deps: Deps): Deps {
  return withFetchGetter(deps, () => {
    throw new Error("injected failure: fetch read");
  });
}

/** A copy of `deps` whose `fetch` throws on the first read only. */
export function throwOnceDeps(deps: Deps): Deps {
  const real = deps.fetch;
  let reads = 0;
  return withFetchGetter(deps, () => {
    reads += 1;
    if (reads === 1) throw new Error("injected failure: first fetch read");
    return real;
  });
}
