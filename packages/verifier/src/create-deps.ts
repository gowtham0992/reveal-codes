import { initialBucket } from "./bucket";
import type { Deps, DepsInit, VerifierState } from "./deps";

function freshState(startMs: number): VerifierState {
  return {
    bucket: { value: initialBucket(startMs) },
    counters: { value: { hits: 0, misses: 0, writes: 0 } },
    gateTail: { value: Promise.resolve() },
  };
}

/**
 * Builds a `Deps` holding the six fields of `init` and a fresh state.
 * Trailing `/` characters are trimmed from `baseUrl`. Two calls share no state.
 */
export function createDeps(init: DepsInit): Deps {
  const base = {
    fetch: init.fetch,
    now: init.now,
    sleep: init.sleep,
    cache: init.cache,
    baseUrl: init.baseUrl.replace(/\/+$/, ""),
    state: freshState(init.now().getTime()),
  };
  return init.token === undefined ? base : { ...base, token: init.token };
}
