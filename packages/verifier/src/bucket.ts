/** Token bucket types. Task 4.1 completes this module (refill, waitFor, take, acquire). */

export const CAPACITY = 60;
export const REFILL_MS = 1000;
export const WINDOW_MS = 60_000;

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
