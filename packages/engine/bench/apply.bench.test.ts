/**
 * Benchmark_Script (Req 21.1 to 21.5). Manual only: `pnpm --filter @reveal-codes/engine bench`.
 * Each scenario gets 100 untimed warm-ups and 1,000 timed runs from the same input Document.
 */
import { writeFileSync } from "node:fs";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { it } from "vitest";
import { apply } from "../src/index.js";
import type { CallerOperation, Document } from "../src/index.js";
import { BENCH_SEED, buildFixture } from "./fixture.js";

const WARM_UPS = 100;
const RUNS = 1_000;
const MEDIAN_LIMIT_MS = 5;
const P95_LIMIT_MS = 15;
const RESULTS_PATH = fileURLToPath(new URL("./results.json", import.meta.url));

type Scenario = Readonly<{ name: string; op: CallerOperation }>;
type Measured = Readonly<{ scenario: string; medianMs: number; p95Ms: number }>;

const HUM = { origin: "HUM", timestamp: "2026-06-01T00:00:00Z" } as const;

function scenarios(outsideAt: number, insideCitationAt: number): readonly Scenario[] {
  return [
    {
      name: "21.1 insert outside every citation and run extent",
      op: { kind: "insert", at: outsideAt, text: "x", provenance: HUM },
    },
    {
      name: "21.2 insert inside a citation and a run extent",
      op: { kind: "insert", at: insideCitationAt, text: "x", provenance: HUM },
    },
    {
      name: "21.3 delete outside every citation",
      op: { kind: "delete", from: outsideAt, to: outsideAt + 1, actor: "HUM" },
    },
    {
      name: "21.3 replace outside every citation",
      op: { kind: "replace", from: outsideAt, to: outsideAt + 1, text: "y", provenance: HUM },
    },
  ];
}

/** Applies once and returns the elapsed milliseconds; a failed apply throws. */
function timeOnce(doc: Document, op: CallerOperation): number {
  const t0 = performance.now();
  const result = apply(doc, op);
  const elapsed = performance.now() - t0;
  if (!result.ok) throw new Error(`apply failed in benchmark: ${result.error.kind}`);
  return elapsed;
}

function rank(sorted: readonly number[], q: number): number {
  return sorted[Math.ceil(q * sorted.length) - 1] ?? Number.NaN;
}

function measure(doc: Document, scenario: Scenario): Measured {
  for (let i = 0; i < WARM_UPS; i++) timeOnce(doc, scenario.op);
  const times = Array.from({ length: RUNS }, () => timeOnce(doc, scenario.op)).sort(
    (a, b) => a - b,
  );
  const mid = RUNS / 2;
  const medianMs = ((times[mid - 1] ?? Number.NaN) + (times[mid] ?? Number.NaN)) / 2;
  return { scenario: scenario.name, medianMs, p95Ms: rank(times, 0.95) };
}

const fmt = (ms: number): string => ms.toFixed(4);

function failing(measured: readonly Measured[]): readonly Measured[] {
  return measured.filter((m) => !(m.medianMs < MEDIAN_LIMIT_MS) || !(m.p95Ms < P95_LIMIT_MS));
}

function resultsJson(measured: readonly Measured[], counts: object): string {
  const cpus = os.cpus();
  return `${JSON.stringify(
    {
      seed: BENCH_SEED,
      documentCounts: counts,
      thresholds: { medianMs: MEDIAN_LIMIT_MS, p95Ms: P95_LIMIT_MS },
      warmUps: WARM_UPS,
      timedRuns: RUNS,
      scenarios: measured.map((m) => ({
        scenario: m.scenario,
        medianMs: m.medianMs,
        p95Ms: m.p95Ms,
        pass: !failing([m]).length,
      })),
      machine: {
        nodeVersion: process.version,
        os: `${os.type()} ${os.release()} ${os.arch()}`,
        cpuModel: cpus[0]?.model ?? "unknown",
        totalMemoryBytes: os.totalmem(),
      },
    },
    null,
    2,
  )}\n`;
}

/** Best effort: a failed write is reported and never fails the benchmark. */
function writeResults(json: string): void {
  try {
    writeFileSync(RESULTS_PATH, json);
  } catch (cause: unknown) {
    console.warn(`Could not write ${RESULTS_PATH}: ${String(cause)}`);
  }
}

it("apply meets the Req 21 latency limits", () => {
  const fixture = buildFixture();
  const { outsideAt, insideCitationAt } = fixture.offsets;
  const measured = scenarios(outsideAt, insideCitationAt).map((s) => measure(fixture.document, s));
  for (const m of measured) {
    console.log(`${m.scenario}: median ${fmt(m.medianMs)} ms, p95 ${fmt(m.p95Ms)} ms`);
  }
  writeResults(resultsJson(measured, fixture.counts));
  const bad = failing(measured);
  if (bad.length > 0) {
    const lines = bad.map(
      (m) => `${m.scenario}: median ${fmt(m.medianMs)} ms, p95 ${fmt(m.p95Ms)} ms`,
    );
    throw new Error(
      `Benchmark limits exceeded (median < ${String(MEDIAN_LIMIT_MS)} ms, p95 < ${String(P95_LIMIT_MS)} ms):\n${lines.join("\n")}`,
    );
  }
}, 300_000);
