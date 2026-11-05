import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { arbDocument, arbOpTrace, arbThreshold } from "../src/testing/arbitraries";
import type { CallerOperation, Document, Origin, Provenance, RunEntry } from "../src/types";
import { runs } from "./support/fc";

// Shared helpers for Properties 11 to 13 (design "Correctness Properties", [relabel]).

/** One code unit's label: its Origin and Run_Id (absent for HUM and PST). */
type Unit = Readonly<{ origin: Origin; runId: string | undefined }>;

/** The per-code-unit labels of `doc`, read straight off its Spans. */
function unitsOf(doc: Document): readonly Unit[] {
  const units: Unit[] = [];
  for (const s of doc.spans) {
    for (let i = s.start; i < s.end; i++) {
      units.push({ origin: s.provenance.origin, runId: s.provenance.runId });
    }
  }
  return units;
}

/** Run_Extent of `runId` in `units`: first to one past last code unit carrying it, or null. */
function extentOf(units: readonly Unit[], runId: string): readonly [number, number] | null {
  let first = -1;
  let last = -1;
  units.forEach((u, i) => {
    if (u.runId !== runId) return;
    if (first < 0) first = i;
    last = i;
  });
  return first < 0 ? null : [first, last + 1];
}

/** Accounting fields of a Run table entry; the relabelled flag belongs to Property 12. */
type Account = Readonly<{ runId: string; originalLength: number; editedCount: number }>;

const accountsOf = (table: readonly RunEntry[]): readonly Account[] =>
  table.map(({ runId, originalLength, editedCount }) => ({ runId, originalLength, editedCount }));

/** The op's delete range, Actor, and inserted text with its Provenance, in one shape. */
type EditShape = Readonly<{
  from: number;
  to: number;
  actor: Origin;
  text: string;
  provenance: Provenance | null;
}>;

function shapeOf(op: CallerOperation): EditShape {
  if (op.kind === "insert") {
    const { at, text, provenance } = op;
    return { from: at, to: at, actor: provenance.origin, text, provenance };
  }
  if (op.kind === "delete") {
    return { from: op.from, to: op.to, actor: op.actor, text: "", provenance: null };
  }
  const { from, to, text, provenance } = op;
  return { from, to, actor: provenance.origin, text, provenance };
}

/**
 * Test-local edit model (Req 4.8, 4.9, 6.1, 6.2, 6.7, 6.9): the Run table
 * accounting `apply(prev, op)` must produce. HUM-actor deletes add the
 * deleted `AI`-origin code units of each Run; HUM inserts add the inserted
 * length to every Run whose extent, measured after the delete, strictly
 * contains the insertion Offset; non-empty `AI` inserts add `text.length` to
 * the Run's Original_Length, creating the entry if absent. PST and AI
 * Actors change no edited count.
 */
function expectedAccounts(prev: Document, op: CallerOperation): readonly Account[] {
  const { from, to, actor, text, provenance } = shapeOf(op);
  const before = unitsOf(prev);
  const afterDelete = [...before.slice(0, from), ...before.slice(to)];
  const deleted = before.slice(from, to);
  const table = new Map(accountsOf(prev.runs).map((a) => [a.runId, a]));
  for (const [runId, entry] of table) {
    let edited = 0;
    if (actor === "HUM") {
      edited += deleted.filter((u) => u.origin === "AI" && u.runId === runId).length;
      const extent = extentOf(afterDelete, runId);
      if (text.length > 0 && extent !== null && extent[0] < from && from < extent[1]) {
        edited += text.length;
      }
    }
    table.set(runId, { ...entry, editedCount: entry.editedCount + edited });
  }
  const aiRun = provenance?.origin === "AI" ? provenance.runId : undefined;
  if (aiRun !== undefined && text.length > 0) {
    const entry = table.get(aiRun) ?? { runId: aiRun, originalLength: 0, editedCount: 0 };
    table.set(aiRun, { ...entry, originalLength: entry.originalLength + text.length });
  }
  return [...table.values()].sort((a, b) => (a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : 0));
}

/** An `arbDocument`, a threshold setting, and a trace of ops applied to it under that setting. */
const arbAccountingCase = fc
  .tuple(arbDocument, arbThreshold)
  .chain(([doc, setting]) =>
    arbOpTrace(doc, setting.config).map((steps) => ({ doc, setting, steps })),
  );

describe("relabel properties: Run table accounting _Requirements: 4.8, 4.9, 6.1, 6.2, 6.7_", () => {
  it("Property 11: Run table accounting matches the edit model", () => {
    // Property 11
    fc.assert(
      fc.property(arbAccountingCase, ({ doc, steps }) => {
        let prev = doc;
        for (const { op, result } of steps) {
          expect(result.ok).toBe(true);
          if (!result.ok) return;
          const next = result.value.document;
          expect(accountsOf(next.runs)).toEqual(expectedAccounts(prev, op));
          prev = next;
        }
      }),
      runs(),
    );
  });
});

/**
 * Whether `op` is a no-op Caller_Operation under Req 4.7: empty insert,
 * empty-range delete, or empty-range replace with empty text. Such ops
 * return the input Document unchanged, so they never relabel a Run.
 */
const isNoOp = (op: CallerOperation): boolean => {
  const { from, to, text } = shapeOf(op);
  return from === to && text.length === 0;
};

/**
 * The relabelled flag each Run must carry after a non-empty op (Req 6.3,
 * 6.4, 6.5, 6.8, 6.10): set iff it was set before, or the Run's
 * Edited_Proportion after the op is strictly above `threshold`.
 */
function expectedFlags(prev: Document, next: Document, threshold: number): Map<string, boolean> {
  const before = new Map(prev.runs.map((r) => [r.runId, r.relabelled]));
  return new Map(
    next.runs.map((r) => [
      r.runId,
      (before.get(r.runId) ?? false) || r.editedCount / r.originalLength > threshold,
    ]),
  );
}

/** Asserts Property 12 for one successful step `prev -> next` caused by `op`. */
function checkRelabelStep(prev: Document, next: Document, op: CallerOperation, t: number): void {
  if (isNoOp(op)) {
    expect(next).toEqual(prev);
    return;
  }
  const flags = new Map(next.runs.map((r) => [r.runId, r.relabelled]));
  expect(flags).toEqual(expectedFlags(prev, next, t));
  for (const r of prev.runs) {
    if (r.relabelled) expect(flags.get(r.runId)).toBe(true);
  }
  for (const s of next.spans) {
    const runId = s.provenance.runId;
    if (runId === undefined) continue;
    expect(s.provenance.origin).toBe(flags.get(runId) === true ? "AI>HUM" : "AI");
  }
}

describe("relabel properties: threshold relabelling _Requirements: 6.3, 6.4, 6.5, 6.8, 6.10_", () => {
  it("Property 12: a Run is relabelled exactly when its Edited_Proportion exceeds the threshold, and stays relabelled", () => {
    // Property 12
    fc.assert(
      fc.property(arbAccountingCase, ({ doc, setting, steps }) => {
        let prev = doc;
        for (const { op, result } of steps) {
          expect(result.ok).toBe(true);
          if (!result.ok) return;
          const next = result.value.document;
          checkRelabelStep(prev, next, op, setting.threshold);
          prev = next;
        }
      }),
      runs(),
    );
  });
});
