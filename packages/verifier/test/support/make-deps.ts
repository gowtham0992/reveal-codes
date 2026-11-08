import { createMemoryCacheStore } from "../../src/cache-memory";
import { createDeps } from "../../src/create-deps";
import type { CacheStore, Deps } from "../../src/deps";
import { createManualClock, type ManualClock } from "./manual-clock";
import { scriptedFetch, type ScriptedFetch, type ScriptStep } from "./scripted-fetch";

export const TEST_BASE_URL = "https://cl.test/api/rest/v4";

export type TestDeps = Readonly<{
  deps: Deps;
  fetch: ScriptedFetch;
  clock: ManualClock;
  cache: CacheStore;
}>;

/** `createDeps` over a scripted fetch, a manual clock and a memory store. */
export function makeDeps(
  steps: readonly ScriptStep[] = [],
  opts: Readonly<{ token?: string; startMs?: number }> = {},
): TestDeps {
  const clock = createManualClock(opts.startMs);
  const fetch = scriptedFetch(steps);
  const cache = createMemoryCacheStore({ now: clock.now });
  const init = {
    fetch: fetch.fetch,
    now: clock.now,
    sleep: clock.sleep,
    cache,
    baseUrl: TEST_BASE_URL,
  };
  const deps = createDeps(opts.token === undefined ? init : { ...init, token: opts.token });
  return { deps, fetch, clock, cache };
}
