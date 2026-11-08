import * as fc from "fast-check";
import type { CitationRecord } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { createMemoryCacheStore } from "../src/cache-memory";
import { createDeps } from "../src/create-deps";
import type { FetchLike } from "../src/deps";
import { lookup } from "../src/lookup";
import { arbClock, arbResponseScript, responseFor } from "./support/arb-script";
import type { ResponseSpec } from "./support/arb-script";
import { runs } from "./support/fc";
import { createManualClock } from "./support/manual-clock";

const WINDOW_MS = 60_000;

type Sent = Readonly<{ atMs: number; lines: number }>;

type FullRecord = Extract<CitationRecord, { kind: "full" }>;

/** `count` Full_Records whose Citation_Lines have never appeared before in this run. */
function freshRecords(count: number, firstVolume: number): FullRecord[] {
  return Array.from({ length: count }, (_, i) => {
    const volume = firstVolume + i;
    const text = `${String(volume)} U.S. 1`;
    return {
      kind: "full",
      key: `k${String(volume)}`,
      citation: {
        start: 0,
        end: text.length,
        text,
        value: { kind: "reporter", volume, reporter: "U.S.", page: 1 },
      },
      result: { status: "unchecked" },
    };
  });
}

/** Most lines sent in any window [t, t + 60000) with t at a recorded dispatch (the worst case). */
function worstWindow(sent: readonly Sent[]): number {
  let worst = 0;
  for (const start of sent) {
    const total = sent
      .filter((s) => s.atMs >= start.atMs && s.atMs < start.atMs + WINDOW_MS)
      .reduce((sum, s) => sum + s.lines, 0);
    worst = Math.max(worst, total);
  }
  return worst;
}

async function runCalls(
  sizes: readonly number[],
  gaps: readonly number[],
  script: readonly ResponseSpec[],
) {
  const clock = createManualClock();
  const sent: Sent[] = [];
  let reply = 0;
  const fetch: FetchLike = (_url, init) => {
    const text = new URLSearchParams(init.body).get("text") ?? "";
    const lines = text === "" ? 0 : text.split("\n").length;
    sent.push({ atMs: clock.nowMs(), lines });
    const spec = script[reply++] ?? { kind: "ok" as const };
    return Promise.resolve(responseFor(spec, lines, clock.nowMs()));
  };
  const deps = createDeps({
    fetch,
    now: clock.now,
    sleep: clock.sleep,
    cache: createMemoryCacheStore({ now: clock.now }),
    baseUrl: "https://cl.test/api/rest/v4",
  });
  let volume = 1;
  for (const [i, size] of sizes.entries()) {
    clock.advance(gaps[i] ?? 0);
    await lookup(freshRecords(size, volume), deps);
    volume += size;
  }
  return { sent, deps };
}

// Property 3
// Feature: citation-verifier, Property 3: Lines sent in any 60 000 ms window never exceed 60
describe("Property 3: window rate limit _Requirements: 7.1, 7.3, 7.4, 7.5, 7.12, 7.13_", () => {
  it("lines passed to fetch in any 60 000 ms window total at most 60", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbClock,
        fc.array(fc.integer({ min: 1, max: 130 }), { minLength: 1, maxLength: 8 }),
        arbResponseScript,
        async (gaps, sizes, script) => {
          const { sent, deps } = await runCalls(sizes, gaps, script);
          expect(worstWindow(sent)).toBeLessThanOrEqual(60);
          const b = deps.state.bucket.value;
          expect(b.tokens).toBeGreaterThanOrEqual(0);
          expect(b.tokens).toBeLessThanOrEqual(60);
          expect(Number.isInteger(b.tokens) && Number.isInteger(b.partialMs)).toBe(true);
          expect(b.partialMs).toBeGreaterThanOrEqual(0);
          expect(b.partialMs).toBeLessThanOrEqual(999);
        },
      ),
      { numRuns: runs() },
    );
  });
});
