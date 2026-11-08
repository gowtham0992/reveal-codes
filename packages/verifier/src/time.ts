import type { Deps } from "./deps";

const MIN_MS = -62_167_219_200_000; // 0000-01-01T00:00:00.000Z
const MAX_MS = 253_402_300_799_999; // 9999-12-31T23:59:59.999Z

export function nowMs(deps: Pick<Deps, "now">): number {
  return deps.now().getTime();
}

/** ISO-8601 UTC string, or `null` when `ms` is not finite or the year is outside 0000 to 9999. */
export function toIso(ms: number): string | null {
  if (!Number.isFinite(ms) || ms < MIN_MS || ms > MAX_MS) return null;
  return new Date(ms).toISOString();
}

/** A `wait_until` value as an ISO-8601 UTC string, or `null` when absent or not a timestamp. */
export function parseWaitUntil(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : toIso(ms);
}

/**
 * `Retry-After` as a delay in milliseconds (never negative), or `null` when absent or unparseable.
 * Accepts non-negative integer seconds or an HTTP date.
 */
export function parseRetryAfter(value: string | null, nowMillis: number): number | null {
  if (value === null) return null;
  const v = value.trim();
  if (/^[0-9]+$/.test(v)) {
    const ms = Number.parseInt(v, 10) * 1000;
    return Number.isSafeInteger(ms) ? ms : null;
  }
  if (!/[A-Za-z]/.test(v)) return null;
  const at = Date.parse(v);
  return Number.isNaN(at) ? null : Math.max(0, at - nowMillis);
}

/** `Retry-After` converted to an ISO timestamp with the injected clock, or `null`. */
export function retryAfterIso(value: string | null, nowMillis: number): string | null {
  const delay = parseRetryAfter(value, nowMillis);
  return delay === null ? null : toIso(nowMillis + delay);
}
