/**
 * Helpers for Property 13 (design "Correctness Properties", [relabel];
 * Req 6.11, 6.12, 7.4), kept here so relabel.properties.test.ts stays
 * under the 300-line module limit.
 */
import fc from "fast-check";
import { expect } from "vitest";
import { apply } from "../../src/document";
import {
  arbBoundary,
  arbRange,
  arbText,
  arbTimestamp,
  RUN_ID_POOL,
} from "../../src/testing/arbitraries";
import type {
  CallerOperation,
  Document,
  EngineConfig,
  Insert,
  Origin,
  Provenance,
} from "../../src/types";

/** The Provenance of the span covering code unit `i` of `doc`. */
function provenanceAt(doc: Document, i: number): Provenance | undefined {
  return doc.spans.find((s) => s.start <= i && i < s.end)?.provenance;
}

/** Asserts Req 6.12: no Run_Id carries both `AI` and `AI>HUM` spans in `doc`. */
export function expectNoMixedRun(doc: Document): void {
  const origins = new Map<string, Set<Origin>>();
  for (const s of doc.spans) {
    const runId = s.provenance.runId;
    if (runId === undefined) continue;
    origins.set(runId, (origins.get(runId) ?? new Set<Origin>()).add(s.provenance.origin));
  }
  for (const set of origins.values()) expect(set.size).toBe(1);
}

/** A caller Insert or Replace against `doc` that forges Origin `AI>HUM` (Req 7.4). */
export function arbForgedOp(doc: Document): fc.Arbitrary<CallerOperation> {
  const provenance = fc
    .tuple(fc.constantFrom(...RUN_ID_POOL), arbTimestamp)
    .map(([runId, timestamp]): Provenance => ({ origin: "AI>HUM", runId, timestamp }));
  const insert = fc
    .tuple(arbBoundary(doc), arbText, provenance)
    .map(([at, text, p]): CallerOperation => ({ kind: "insert", at, text, provenance: p }));
  const replace = fc
    .tuple(arbRange(doc), arbText, provenance)
    .map(([[from, to], text, p]): CallerOperation => ({
      kind: "replace",
      from,
      to,
      text,
      provenance: p,
    }));
  return fc.oneof(insert, replace);
}

/** A non-empty `AI` Insert under one of `doc`'s relabelled Runs, or null if it has none. */
export function arbRelabelledInsert(doc: Document): fc.Arbitrary<Insert | null> {
  const relabelled = doc.runs.filter((r) => r.relabelled).map((r) => r.runId);
  if (relabelled.length === 0) return fc.constant(null);
  return fc
    .tuple(
      arbBoundary(doc),
      arbText.filter((t) => t.length > 0),
      fc.constantFrom(...relabelled),
      arbTimestamp,
    )
    .map(([at, text, runId, timestamp]): Insert => ({
      kind: "insert",
      at,
      text,
      provenance: { origin: "AI", runId, timestamp },
    }));
}

/** Asserts Req 6.11 and 4.8 for an `AI` Insert under relabelled Run `op.provenance.runId`. */
export function checkRelabelledInsert(
  doc: Document,
  op: Insert,
  config: EngineConfig | undefined,
): void {
  const result = apply(doc, op, config);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const next = result.value.document;
  const { runId, timestamp } = op.provenance;
  const end = op.at + op.text.length;
  const span = next.spans.find((s) => s.start <= op.at && op.at < s.end);
  expect(span !== undefined && span.end >= end).toBe(true);
  if (span === undefined) return;
  // Req 4.11 via 6.11: the inserted piece carries the op's Timestamp unless
  // it merged into a preceding Mergeable span, whose Timestamp then wins.
  const stamp = span.start === op.at ? timestamp : provenanceAt(doc, span.start)?.timestamp;
  expect(span.provenance).toEqual({ origin: "AI>HUM", runId, timestamp: stamp });
  const before = doc.runs.find((r) => r.runId === runId);
  const after = next.runs.find((r) => r.runId === runId);
  expect(after?.originalLength).toBe((before?.originalLength ?? 0) + op.text.length);
  expect(after?.relabelled).toBe(true);
  expectNoMixedRun(next);
}
