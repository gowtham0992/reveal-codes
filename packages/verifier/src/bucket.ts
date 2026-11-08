/** Token bucket and Window_Log (design A3). Integer milliseconds throughout. */
import type { Deps } from "./deps";
import { nowMs } from "./time";

export const CAPACITY = 60;
export const REFILL_MS = 1000;
export const WINDOW_MS = 60_000;
const MAX_ITERATIONS = 3;

export type BucketState = Readonly<{
  /** Integer, 0..60. */
  tokens: number;
  /** Integer, 0..999; elapsed ms toward the next token. */
  partialMs: number;
  /** Clock reading (ms) at the last refill. */
  lastMs: number;
  /** Dispatches inside the window, ascending `atMs`. */
  sent: readonly Readonly<{ atMs: number; lines: number }>[];
}>;

/** A full bucket with an empty Window_Log, anchored at `startMs`. */
export function initialBucket(startMs: number): BucketState {
  return { tokens: CAPACITY, partialMs: 0, lastMs: startMs, sent: [] };
}

/** Credits whole elapsed seconds, keeps partial ms below the cap, never credits a backwards step. */
export function refill(b: BucketState, now: number): BucketState {
  const total = b.partialMs + Math.max(0, now - b.lastMs);
  const tokens = Math.min(CAPACITY, b.tokens + Math.floor(total / REFILL_MS));
  const partialMs = tokens === CAPACITY ? 0 : total % REFILL_MS;
  return { ...b, tokens, partialMs, lastMs: now };
}

function live(b: BucketState, now: number): BucketState["sent"] {
  return b.sent.filter((e) => e.atMs > now - WINDOW_MS);
}

function bucketWait(b: BucketState, n: number): number {
  return b.tokens >= n ? 0 : (n - b.tokens) * REFILL_MS - b.partialMs;
}

function windowWait(b: BucketState, n: number, now: number): number {
  const entries = live(b, now);
  let used = entries.reduce((sum, e) => sum + e.lines, 0);
  for (const e of entries) {
    if (used + n <= CAPACITY) break;
    used -= e.lines;
    if (used + n <= CAPACITY) return e.atMs + WINDOW_MS - now;
  }
  return 0;
}

/** Larger of the bucket wait and the sliding-window wait. `b` must already be refilled to `now`. */
export function waitFor(b: BucketState, n: number, now: number): number {
  return Math.max(bucketWait(b, n), windowWait(b, n, now));
}

/** Deducts `n` tokens, records the dispatch, and prunes expired window entries. */
export function take(b: BucketState, n: number, now: number): BucketState {
  const sent = [...live(b, now), { atMs: now, lines: n }];
  return { ...b, tokens: b.tokens - n, sent };
}

/** Tokens available at `now`, computed without storing anything. */
export function availableTokens(b: BucketState, now: number): number {
  return refill(b, now).tokens;
}

/**
 * Waits (one `Deps.sleep` per positive wait) until `n` lines may be sent, then deducts them.
 * Returns false, deducting nothing, if the clock never advanced after three iterations.
 */
export async function acquire(deps: Deps, n: number): Promise<boolean> {
  const cell = deps.state.bucket;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const now = nowMs(deps);
    const b = refill(cell.value, now);
    const w = waitFor(b, n, now);
    if (w === 0) {
      cell.value = take(b, n, now);
      return true;
    }
    cell.value = b;
    await deps.sleep(w);
  }
  return false;
}
