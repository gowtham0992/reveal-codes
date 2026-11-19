/** An injected clock: milliseconds since the epoch and the same instant as an ISO string. */
export type TestClock = {
  nowMs: () => number;
  nowIso: () => string;
};

/** The start of the clocks below: 2026-01-01T00:00:00.000Z. */
export const CLOCK_START_MS = Date.UTC(2026, 0, 1);

/** A clock that always reports the same instant. */
export function fixedClock(ms: number = CLOCK_START_MS): TestClock {
  return { nowMs: () => ms, nowIso: () => new Date(ms).toISOString() };
}

/** A clock that moves forward by `stepMs` after every reading (`nowMs` or `nowIso`). */
export function advancingClock(
  startMs: number = CLOCK_START_MS,
  stepMs = 1000,
): TestClock & { readonly peekMs: () => number } {
  let current = startMs;
  const read = (): number => {
    const value = current;
    current += stepMs;
    return value;
  };
  return {
    nowMs: read,
    nowIso: () => new Date(read()).toISOString(),
    peekMs: () => current,
  };
}
