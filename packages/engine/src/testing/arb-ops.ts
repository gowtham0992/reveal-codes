/**
 * Caller_Operation arbitraries (design "Arbitraries" table: `arbOp`,
 * `arbOpSequence`; Properties 1, 6, 7, 8, 11, 12, 13; Req 22.1, 22.4).
 * Built only from fast-check combinators. Offsets are drawn in
 * [0, length] and snapped left off Surrogate_Pair interiors with `.map`,
 * so shrinking still works and every op is valid against its Document.
 * No Insert or Replace carries Origin `AI>HUM` (Req 22.1).
 */
import fc from "fast-check";
import { apply } from "../document.js";
import type { EngineError } from "../errors.js";
import type { Result } from "../result.js";
import type {
  Applied,
  CallerOperation,
  Delete,
  Document,
  EngineConfig,
  Insert,
  Origin,
  Provenance,
  Replace,
} from "../types.js";
import { isValidBoundary } from "../validate.js";
import { arbText, arbTimestamp } from "./arb-text.js";

/** The Run_Id pool of 8, including Codes syntax (`r[1]`, `a\b`). */
export const RUN_ID_POOL: readonly string[] = [
  "r1",
  "r2",
  "r3",
  "r[1]",
  "a\\b",
  "{r}",
  "r;5",
  "r=,6",
];

/** Snaps `offset` left by one when it falls inside a Surrogate_Pair of `text`. */
export const snapBoundary = (text: string, offset: number): number =>
  isValidBoundary(text, offset) ? offset : offset - 1;

/** Ranges ops are biased into: citations, quotes, and `AI` / `AI>HUM` spans. */
function hotRanges(doc: Document): readonly (readonly [number, number])[] {
  const cits = doc.citations.map((c) => [c.citation.start, c.citation.end] as const);
  const quotes = doc.quotes.map((q) => [q.quote.start, q.quote.end] as const);
  const ai = doc.spans
    .filter((s) => s.provenance.origin === "AI" || s.provenance.origin === "AI>HUM")
    .map((s) => [s.start, s.end] as const);
  return [...cits, ...quotes, ...ai];
}

/** A Valid_Boundary of `doc.text`, biased into `hotRanges(doc)` when there are any. */
export function arbBoundary(doc: Document): fc.Arbitrary<number> {
  const len = doc.text.length;
  const uniform = fc.integer({ min: 0, max: len });
  const ranges = hotRanges(doc);
  const inRange = fc
    .tuple(fc.nat({ max: Math.max(0, ranges.length - 1) }), fc.nat())
    .map(([i, k]) => {
      const [start, end] = ranges[i] ?? [0, len];
      return start + (k % (end - start + 1));
    });
  const raw = ranges.length === 0 ? uniform : fc.oneof(uniform, inRange);
  return raw.map((offset) => snapBoundary(doc.text, offset));
}

/** Two Valid_Boundaries `[from, to]` with `from ≤ to`. */
export function arbRange(doc: Document): fc.Arbitrary<readonly [number, number]> {
  return fc
    .tuple(arbBoundary(doc), arbBoundary(doc))
    .map(([a, b]) => (a <= b ? ([a, b] as const) : ([b, a] as const)));
}

/** Run_Ids for `AI` ops: the pool, biased toward Runs `doc` has relabelled (Req 6.11). */
function arbRunId(doc: Document): fc.Arbitrary<string> {
  const pool = fc.constantFrom(...RUN_ID_POOL);
  const relabelled = doc.runs.filter((r) => r.relabelled).map((r) => r.runId);
  if (relabelled.length === 0) return pool;
  return fc.oneof({ arbitrary: fc.constantFrom(...relabelled), weight: 2 }, pool);
}

/** A caller Provenance with Origin `HUM`, `PST`, or `AI`; never `AI>HUM`. */
export function arbCallerProvenance(doc: Document): fc.Arbitrary<Provenance> {
  const plain = fc
    .tuple(fc.constantFrom("HUM" as const, "PST" as const), arbTimestamp)
    .map(([origin, timestamp]): Provenance => ({ origin, timestamp }));
  const ai = fc
    .tuple(arbRunId(doc), arbTimestamp)
    .map(([runId, timestamp]): Provenance => ({ origin: "AI", runId, timestamp }));
  return fc.oneof(plain, ai);
}

/** Delete Actors: mostly `HUM`; `AI>HUM` is a permitted Actor (Req 7.5). */
const arbActor: fc.Arbitrary<Origin> = fc.oneof(
  { arbitrary: fc.constant("HUM" as const), weight: 5 },
  fc.constantFrom("PST" as const, "AI" as const, "AI>HUM" as const),
);

/** A valid Insert against `doc`, possibly with empty text. */
export function arbInsert(doc: Document): fc.Arbitrary<Insert> {
  return fc
    .tuple(arbBoundary(doc), arbText, arbCallerProvenance(doc))
    .map(([at, text, provenance]): Insert => ({ kind: "insert", at, text, provenance }));
}

/** A valid Delete against `doc`, possibly over an empty range. */
export function arbDelete(doc: Document): fc.Arbitrary<Delete> {
  return fc
    .tuple(arbRange(doc), arbActor)
    .map(([[from, to], actor]): Delete => ({ kind: "delete", from, to, actor }));
}

/** A single valid Insert or Delete against `doc`, including empty ones (Property 6). */
export function arbCallerInsertOrDelete(doc: Document): fc.Arbitrary<Insert | Delete> {
  return fc.oneof(arbInsert(doc), arbDelete(doc));
}

/** A valid Replace against `doc`, possibly empty (Property 7). */
export function arbReplace(doc: Document): fc.Arbitrary<Replace> {
  return fc
    .tuple(arbRange(doc), arbText, arbCallerProvenance(doc))
    .map(([[from, to], text, provenance]): Replace => ({
      kind: "replace",
      from,
      to,
      text,
      provenance,
    }));
}

/** One valid Caller_Operation against `doc`: Insert, Delete, or Replace. */
export function arbOp(doc: Document): fc.Arbitrary<CallerOperation> {
  return fc.oneof(arbInsert(doc), arbDelete(doc), arbReplace(doc));
}

/** One step of a trace: the op and what `apply` returned for it. */
export type OpStep = Readonly<{ op: CallerOperation; result: Result<Applied, EngineError> }>;

/**
 * `n` ops, each drawn against the Document the previous ones produced
 * (design: recursive `fc.chain`). If `apply` ever rejects an op, the trace
 * ends with that step, so a test applying the ops sees the failure.
 */
function arbSteps(
  doc: Document,
  n: number,
  config: EngineConfig | undefined,
): fc.Arbitrary<readonly OpStep[]> {
  if (n === 0) return fc.constant([]);
  return arbOp(doc).chain((op): fc.Arbitrary<readonly OpStep[]> => {
    const result = apply(doc, op, config);
    const step: OpStep = { op, result };
    if (!result.ok) return fc.constant([step]);
    return arbSteps(result.value.document, n - 1, config).map((rest) => [step, ...rest]);
  });
}

/** 0 to 20 steps against `doc`, applied under `config`. */
export function arbOpTrace(doc: Document, config?: EngineConfig): fc.Arbitrary<readonly OpStep[]> {
  return fc.integer({ min: 0, max: 20 }).chain((n) => arbSteps(doc, n, config));
}

/**
 * Sequences of 0 to 20 Caller_Operations against `doc` (Req 22.1). Applying
 * them in order under `config` (default threshold when absent) succeeds.
 */
export function arbOpSequence(
  doc: Document,
  config?: EngineConfig,
): fc.Arbitrary<readonly CallerOperation[]> {
  return arbOpTrace(doc, config).map((steps) => steps.map((s) => s.op));
}

/** A Relabel_Threshold setting: the config to pass and the threshold it means. */
export type ThresholdSetting = Readonly<{ config: EngineConfig | undefined; threshold: number }>;

/**
 * Valid Relabel_Threshold settings (Property 12): absent (no config, or a
 * config without the key), meaning 0.4, or any number in (0, 1], with the
 * edges and small values weighted in.
 */
export const arbThreshold: fc.Arbitrary<ThresholdSetting> = fc.oneof(
  fc.constantFrom<ThresholdSetting>(
    { config: undefined, threshold: 0.4 },
    { config: {}, threshold: 0.4 },
  ),
  fc
    .oneof(
      fc.constantFrom(1, 0.4, 0.05, Number.MIN_VALUE),
      fc.double({ min: 0, max: 1, minExcluded: true, noNaN: true }),
    )
    .map((t): ThresholdSetting => ({ config: { relabelThreshold: t }, threshold: t })),
);
