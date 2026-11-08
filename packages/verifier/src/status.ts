import { availableTokens, CAPACITY } from "./bucket";
import type { Counters, Deps } from "./deps";
import { nowMs } from "./time";

export type VerifierStatus = Readonly<{
  bucket: Readonly<{ available: number; capacity: number }>;
  counters: Readonly<{ hits: number; misses: number; writes: number }>;
}>;

/** Adds one to a counter in `deps.state` (Req 10.13). */
export function bumpCounter(deps: Deps, name: keyof Counters): void {
  const cell = deps.state.counters;
  cell.value = { ...cell.value, [name]: cell.value[name] + 1 };
}

/**
 * Whole tokens available now (computed with `Deps.now`, not stored) and a copy of the
 * counters. Never asks the cache store to list keys (Req 10.14).
 */
export function verifierStatus(deps: Deps): VerifierStatus {
  const { hits, misses, writes } = deps.state.counters.value;
  return {
    bucket: {
      available: availableTokens(deps.state.bucket.value, nowMs(deps)),
      capacity: CAPACITY,
    },
    counters: { hits, misses, writes },
  };
}
