/**
 * A fixed-window request limiter, in memory. It is per server instance: a host that
 * runs several instances (or restarts one) keeps a separate count in each. It is a
 * courtesy limit that keeps one visitor from running up the assistant bill by accident,
 * not a guarantee; the address comes from a header a client can set, so it is no defence
 * against a determined caller.
 */
export const ASSISTANT_LIMIT = 10;
export const ASSISTANT_WINDOW_MS = 10 * 60 * 1000;
/** Address used when the request carries no x-forwarded-for entry. */
export const LOCAL_ADDRESS = "local";
const SWEEP_AT = 1000;
export type Decision =
  | Readonly<{ allowed: true; windowStart: number; used: number }>
  | Readonly<{ allowed: false; windowStart: number; retryAfterSeconds: number }>;
export type Limiter = Readonly<{ check: (address: string) => Decision }>;
export type LimiterOptions = Readonly<{
  limit: number;
  windowMs: number;
  /** Milliseconds since any fixed point; injected so tests control time. */
  now: () => number;
}>;
type Window = { start: number; count: number };
function sweep(windows: Map<string, Window>, now: number, windowMs: number): void {
  for (const [address, w] of windows) {
    if (now >= w.start + windowMs) windows.delete(address);
  }
}
/**
 * Each address has its own window, which opens at that address's first request after
 * the previous window ended and lasts `windowMs`. A request is refused only when its
 * address has already been granted `limit` requests in the current window.
 */
export function createFixedWindowLimiter(options: LimiterOptions): Limiter {
  const { limit, windowMs, now } = options;
  const windows = new Map<string, Window>();
  return {
    check(address) {
      const t = now();
      if (windows.size >= SWEEP_AT) sweep(windows, t, windowMs);
      const known = windows.get(address);
      const current = known !== undefined && t < known.start + windowMs ? known : null;
      const w = current ?? { start: t, count: 0 };
      windows.set(address, w);
      if (w.count >= limit) {
        const retryAfterSeconds = Math.max(1, Math.ceil((w.start + windowMs - t) / 1000));
        return { allowed: false, windowStart: w.start, retryAfterSeconds };
      }
      w.count += 1;
      return { allowed: true, windowStart: w.start, used: w.count };
    },
  };
}
/** The first entry of x-forwarded-for, trimmed; `local` when the header is absent or empty. */
export function clientAddress(headers: Headers): string {
  const first = (headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "";
  return first === "" ? LOCAL_ADDRESS : first;
}
/** The limiter /api/assistant uses: 10 requests per address per 10 minutes. */
export const assistantLimiter: Limiter = createFixedWindowLimiter({
  limit: ASSISTANT_LIMIT,
  windowMs: ASSISTANT_WINDOW_MS,
  now: () => Date.now(),
});
