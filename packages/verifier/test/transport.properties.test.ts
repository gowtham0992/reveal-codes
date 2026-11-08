import * as fc from "fast-check";
import type { CitationRecord, VerificationResult } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { createMemoryCacheStore } from "../src/cache-memory";
import { createDeps } from "../src/create-deps";
import type { FetchLike } from "../src/deps";
import { lookup } from "../src/lookup";
import { arbClock, arbResponseScript, responseFor } from "./support/arb-script";
import type { ResponseSpec } from "./support/arb-script";
import { runs } from "./support/fc";
import { createManualClock } from "./support/manual-clock";

type FullRecord = Extract<CitationRecord, { kind: "full" }>;
type Throttle = Extract<ResponseSpec, { kind: "throttle" }>;

/** `count` Full_Records with distinct lines. At most a few, so the bucket never waits. */
function records(count: number): FullRecord[] {
  return Array.from({ length: count }, (_, i) => {
    const text = `${String(i + 1)} U.S. 1`;
    return {
      kind: "full",
      key: `k${String(i + 1)}`,
      citation: {
        start: 0,
        end: text.length,
        text,
        value: { kind: "reporter", volume: i + 1, reporter: "U.S.", page: 1 },
      },
      result: { status: "unchecked" },
    };
  });
}

/** Expected retry delay (ms) after a throttle: Req 7.8. */
function expectedDelay(s: Throttle): number {
  const hints: number[] = [];
  if (s.retryAfterSec !== undefined) hints.push(s.retryAfterSec * 1000);
  if (s.waitOffsetMs !== undefined) hints.push(Math.max(0, s.waitOffsetMs));
  return Math.min(30_000, hints.length === 0 ? 1000 : Math.max(...hints));
}

/** Expected `waitUntil` after exhaustion: Req 4.5, 4.6. `wait_until` wins over `Retry-After`. */
function expectedWait(s: Throttle, replyMs: number): string | null {
  if (s.waitOffsetMs !== undefined) return new Date(replyMs + s.waitOffsetMs).toISOString();
  if (s.retryAfterSec !== undefined)
    return new Date(replyMs + s.retryAfterSec * 1000).toISOString();
  return null;
}

/** The replies the transport must consume: up to three, stopping at the first non-throttle. */
function consumed(script: readonly ResponseSpec[]): ResponseSpec[] {
  const used: ResponseSpec[] = [];
  for (let i = 0; i < 3; i++) {
    const spec = script[i] ?? { kind: "ok" as const };
    used.push(spec);
    if (spec.kind !== "throttle") break;
  }
  return used;
}

async function run(gaps: readonly number[], size: number, script: readonly ResponseSpec[]) {
  const clock = createManualClock();
  clock.advance(gaps.reduce((a, b) => a + b, 0));
  const retrySleeps: number[] = [];
  let calls = 0;
  let lastReplyMs = clock.nowMs();
  const fetch: FetchLike = (_url, init) => {
    const text = new URLSearchParams(init.body).get("text") ?? "";
    const lines = text === "" ? 0 : text.split("\n").length;
    const spec = script[calls++] ?? { kind: "ok" as const };
    lastReplyMs = clock.nowMs();
    return Promise.resolve(responseFor(spec, lines, lastReplyMs));
  };
  const deps = createDeps({
    fetch,
    now: clock.now,
    // The 15 000 ms request timeout carries a signal; a retry wait does not.
    sleep: (ms, signal) => {
      if (signal === undefined) retrySleeps.push(ms);
      return clock.sleep(ms, signal);
    },
    cache: createMemoryCacheStore({ now: clock.now }),
    baseUrl: "https://cl.test/api/rest/v4",
  });
  const got = await lookup(records(size), deps);
  return { calls, retrySleeps, lastReplyMs, got };
}

function unchecked(waitUntil: string | null): VerificationResult {
  return waitUntil === null ? { status: "unchecked" } : { status: "unchecked", waitUntil };
}

// Property 10
// Feature: citation-verifier, Property 10: Retries are bounded and exhaustion keeps the last wait
describe("Property 10: bounded retries _Requirements: 4.3, 4.5, 4.6, 4.7, 7.6, 7.8, 7.9, 7.10, 7.11_", () => {
  it("at most three requests, stop at the first non-retryable reply, exact sleeps, last wait kept", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbClock,
        fc.integer({ min: 1, max: 3 }),
        arbResponseScript,
        async (gaps, size, script) => {
          const r = await run(gaps, size, script);
          const used = consumed(script);
          const last = used[used.length - 1] as ResponseSpec;
          expect(r.calls).toBe(used.length);
          expect(r.calls).toBeLessThanOrEqual(3);
          expect(r.retrySleeps).toEqual(used.slice(0, -1).map((s) => expectedDelay(s as Throttle)));
          expect(r.got.size).toBe(size);
          for (const result of r.got.values()) {
            if (last.kind === "ok") expect(result.status).toBe("not_found");
            else if (last.kind === "other") expect(result).toEqual(unchecked(null));
            else expect(result).toEqual(unchecked(expectedWait(last, r.lastReplyMs)));
          }
        },
      ),
      { numRuns: runs() },
    );
  });
});
