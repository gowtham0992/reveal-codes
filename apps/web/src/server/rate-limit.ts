import { tooManyRequests } from "./http";

/**
 * Fixed-window request limiters, in memory. Every limit here is a courtesy limit: it is
 * per server instance (a host that runs several instances, or restarts one, keeps a
 * separate count in each), and the address comes from a header a client can set, so it
 * is no defence against a determined caller. It keeps one visitor from running up the
 * assistant bill, or from hammering the citation service, by accident.
 */
export const ASSISTANT_LIMIT = 10;
export const ASSISTANT_WINDOW_MS = 10 * 60 * 1000;
/**
 * /api/verify, live mode only, two counts per address per minute:
 * VERIFY_CEILING (60) counts every request and is applied before the body is read;
 * VERIFY_LIMIT (10) counts once each request that needs the citation service, that is,
 * has at least one Citation_Line not already in the cache. Fully cached requests are
 * not counted against VERIFY_LIMIT.
 */
export const VERIFY_LIMIT = 10;
export const VERIFY_CEILING = 60;
/** /api/opinion/[clusterId]: 30 requests per address per minute. */
export const OPINION_LIMIT = 30;
export const ROUTE_WINDOW_MS = 60 * 1000;
/** /api/assistant with a live provider, in addition to the per-address limit: 200 an hour in total. */
export const ASSISTANT_HOURLY_LIMIT = 200;
export const ASSISTANT_HOURLY_WINDOW_MS = 60 * 60 * 1000;
/** Address used when the request carries no x-forwarded-for entry. */
export const LOCAL_ADDRESS = "local";
const SWEEP_AT = 1000;
export type Decision =
  | Readonly<{ allowed: true; windowStart: number; used: number }>
  | Readonly<{
      allowed: false;
      windowStart: number;
      retryAfterSeconds: number;
      /** Which bound was reached: this address's window, or the total across all addresses. */
      scope: "address" | "all";
    }>;
export type Limiter = Readonly<{
  /** Counts the request when it is allowed. */
  check: (address: string) => Decision;
  /** The decision `check` would give now, without counting anything. */
  peek: (address: string) => Decision;
}>;
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
  const open = (address: string, t: number): Window => {
    const known = windows.get(address);
    return known !== undefined && t < known.start + windowMs ? known : { start: t, count: 0 };
  };
  const decide = (w: Window, t: number): Decision | null =>
    w.count < limit
      ? null
      : {
          allowed: false,
          windowStart: w.start,
          retryAfterSeconds: Math.max(1, Math.ceil((w.start + windowMs - t) / 1000)),
          scope: "address",
        };
  return {
    check(address) {
      const t = now();
      if (windows.size >= SWEEP_AT) sweep(windows, t, windowMs);
      const w = open(address, t);
      windows.set(address, w);
      const refused = decide(w, t);
      if (refused !== null) return refused;
      w.count += 1;
      return { allowed: true, windowStart: w.start, used: w.count };
    },
    peek(address) {
      const t = now();
      const w = open(address, t);
      return decide(w, t) ?? { allowed: true, windowStart: w.start, used: w.count + 1 };
    },
  };
}
/** The first entry of x-forwarded-for, trimmed; `local` when the header is absent or empty. */
export function clientAddress(headers: Headers): string {
  const first = (headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "";
  return first === "" ? LOCAL_ADDRESS : first;
}
const wallClock = (): number => Date.now();
const ALL_ADDRESSES = "all";
/** One window shared by every address: the same fixed window, counted under a single key. */
export function createTotalLimiter(options: LimiterOptions): Limiter {
  const inner = createFixedWindowLimiter(options);
  const total = (d: Decision): Decision => (d.allowed ? d : { ...d, scope: "all" });
  return {
    check: () => total(inner.check(ALL_ADDRESSES)),
    peek: () => total(inner.peek(ALL_ADDRESSES)),
  };
}
/**
 * Both limits must have room. Neither is spent unless both have, so a request refused by
 * one bound never uses up the other. The per-address bound is reported first.
 */
export function allOf(perAddress: Limiter, total: Limiter): Limiter {
  const peek = (address: string): Decision => {
    const own = perAddress.peek(address);
    return own.allowed ? total.peek(address) : own;
  };
  return {
    peek,
    check(address) {
      const room = peek(address);
      if (!room.allowed) return room;
      const own = perAddress.check(address);
      total.check(address);
      return own;
    },
  };
}
/** The limiter /api/assistant uses: 10 per address per 10 minutes and 200 an hour across all. */
export const assistantLimiter: Limiter = allOf(
  createFixedWindowLimiter({
    limit: ASSISTANT_LIMIT,
    windowMs: ASSISTANT_WINDOW_MS,
    now: wallClock,
  }),
  createTotalLimiter({
    limit: ASSISTANT_HOURLY_LIMIT,
    windowMs: ASSISTANT_HOURLY_WINDOW_MS,
    now: wallClock,
  }),
);
export const verifyLimiter: Limiter = createFixedWindowLimiter({
  limit: VERIFY_LIMIT,
  windowMs: ROUTE_WINDOW_MS,
  now: wallClock,
});
export const verifyCeilingLimiter: Limiter = createFixedWindowLimiter({
  limit: VERIFY_CEILING,
  windowMs: ROUTE_WINDOW_MS,
  now: wallClock,
});
export const opinionLimiter: Limiter = createFixedWindowLimiter({
  limit: OPINION_LIMIT,
  windowMs: ROUTE_WINDOW_MS,
  now: wallClock,
});

/** What a route handler needs to apply a limit: the limiter, the caller, and whether it is on. */
export type RouteGuard = Readonly<{ limiter: Limiter; address: string; live: boolean }>;
export function routeGuard(limiter: Limiter, request: Request, live: boolean): RouteGuard {
  return { limiter, address: clientAddress(request.headers), live };
}
/** 429 with Retry-After and `message` when the guard is on and its address is over the limit. */
export function overRouteLimit(guard: RouteGuard | undefined, message: string): Response | null {
  if (guard === undefined || !guard.live) return null;
  const decision = guard.limiter.check(guard.address);
  return decision.allowed ? null : tooManyRequests(message, decision.retryAfterSeconds);
}
