import * as fc from "fast-check";
import type { HttpResponse } from "../../src/deps";

/** Clock gaps (ms) between lookup calls: non-decreasing time, each gap 0 to 120 000. */
export const arbClock: fc.Arbitrary<readonly number[]> = fc.array(
  fc.oneof(
    { weight: 4, arbitrary: fc.integer({ min: 0, max: 120_000 }) },
    { weight: 2, arbitrary: fc.constantFrom(0, 1, 999, 1000, 29_999, 30_000, 59_999, 60_000) },
  ),
  { minLength: 1, maxLength: 8 },
);

/**
 * One scripted server reply. `ok` answers every requested line with a 404 entry.
 * `throttle` is a 429 or 5xx, with optional `Retry-After` (integer seconds) and an
 * optional `wait_until` or `wait_util` body field given as an offset in ms from
 * the moment of the reply (negative means already past).
 */
export type ResponseSpec =
  | Readonly<{ kind: "ok" }>
  | Readonly<{ kind: "other"; status: number }>
  | Readonly<{
      kind: "throttle";
      status: number;
      retryAfterSec: number | undefined;
      waitOffsetMs: number | undefined;
      waitKey: "wait_until" | "wait_util";
    }>;

const arbThrottle: fc.Arbitrary<ResponseSpec> = fc.record({
  kind: fc.constant("throttle" as const),
  status: fc.oneof(
    { weight: 4, arbitrary: fc.constant(429) },
    { weight: 2, arbitrary: fc.constantFrom(500, 502, 503, 599) },
  ),
  retryAfterSec: fc.option(fc.integer({ min: 0, max: 90 }), { nil: undefined }),
  waitOffsetMs: fc.option(fc.integer({ min: -5_000, max: 90_000 }), { nil: undefined }),
  waitKey: fc.constantFrom("wait_until" as const, "wait_util" as const),
});

/** Replies in call order: throttles, other 4xx, and valid 200s. Past the end of the script the server answers `ok`. */
export const arbResponseScript: fc.Arbitrary<readonly ResponseSpec[]> = fc.array(
  fc.oneof(
    { weight: 5, arbitrary: arbThrottle },
    {
      weight: 1,
      arbitrary: fc
        .constantFrom(400, 403, 404)
        .map((status): ResponseSpec => ({ kind: "other", status })),
    },
    { weight: 4, arbitrary: fc.constant<ResponseSpec>({ kind: "ok" }) },
  ),
  { maxLength: 24 },
);

function respond(status: number, headers: Record<string, string>, body: unknown): HttpResponse {
  const lower = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    status,
    headers: { get: (name) => lower.get(name.toLowerCase()) ?? null },
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

/** The HTTP reply for `spec` to a request of `lineCount` lines, replying at clock time `nowMs`. */
export function responseFor(spec: ResponseSpec, lineCount: number, nowMs: number): HttpResponse {
  if (spec.kind === "ok") {
    return respond(
      200,
      {},
      Array.from({ length: lineCount }, () => ({ status: 404, clusters: [] })),
    );
  }
  if (spec.kind === "other") return respond(spec.status, {}, { detail: "no" });
  const headers: Record<string, string> = {};
  if (spec.retryAfterSec !== undefined) headers["Retry-After"] = String(spec.retryAfterSec);
  const body: Record<string, string> = {};
  if (spec.waitOffsetMs !== undefined) {
    body[spec.waitKey] = new Date(nowMs + spec.waitOffsetMs).toISOString();
  }
  return respond(spec.status, headers, body);
}
