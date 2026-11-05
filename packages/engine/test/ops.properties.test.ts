import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { apply, createDocument } from "../src/document";
import { structuralEqual } from "../src/equal";
import {
  arbCallerInsertOrDelete,
  arbDocument,
  arbOpTrace,
  arbReplace,
  arbThreshold,
  type OpStep,
} from "../src/testing/arbitraries";
import type {
  Applied,
  Delete,
  Document,
  EngineConfig,
  Insert,
  Inverse,
  Origin,
  Provenance,
  RunEntry,
  Span,
} from "../src/types";
import { runs } from "./support/fc";

// ---------------------------------------------------------------------------
// Shared helpers: a per-code-unit view of a Document's provenance.
// ---------------------------------------------------------------------------

/** One code unit: its character and the provenance covering it. */
type Unit = Readonly<{ char: string; origin: Origin; runId: string | null; timestamp: string }>;

const runIdOf = (p: Provenance): string | null =>
  Object.prototype.hasOwnProperty.call(p, "runId") ? (p.runId ?? null) : null;

/** Mergeable (Glossary): same Origin and same Run_Id or both absent. */
const mergeable = (a: Unit, b: Unit): boolean => a.origin === b.origin && a.runId === b.runId;

/** What a Document says at each Offset: its character and its Span's record. */
function unitsOf(doc: Document): readonly Unit[] {
  const units: Unit[] = [];
  for (const s of doc.spans) {
    const { origin, timestamp } = s.provenance;
    const runId = runIdOf(s.provenance);
    for (let i = s.start; i < s.end; i++) {
      units.push({ char: doc.text.charAt(i), origin, runId, timestamp });
    }
  }
  return units;
}

/** Per-unit pieces for `text` under one Provenance_Record. */
function unitsFor(text: string, origin: Origin, runId: string | null, timestamp: string): Unit[] {
  return Array.from({ length: text.length }, (_, i) => ({
    char: text.charAt(i),
    origin,
    runId,
    timestamp,
  }));
}

/**
 * Normalisation over units (Req 3.3, 4.11): each maximal run of adjacent
 * Mergeable units takes the Timestamp of its first unit, which belongs to
 * the run's lowest-start piece.
 */
function mergeUnits(units: readonly Unit[]): readonly Unit[] {
  const out: Unit[] = [];
  let head: Unit | null = null;
  for (const u of units) {
    if (head === null || !mergeable(head, u)) head = u;
    out.push({ ...u, timestamp: head.timestamp });
  }
  return out;
}

/** Run_Extents [first start, last end) per Run_Id over `spans` (Glossary). */
function runExtents(spans: readonly Span[]): ReadonlyMap<string, readonly [number, number]> {
  const extents = new Map<string, readonly [number, number]>();
  for (const s of spans) {
    const r = runIdOf(s.provenance);
    if (r === null) continue;
    const prev = extents.get(r);
    extents.set(r, [prev ? prev[0] : s.start, s.end]);
  }
  return extents;
}

// ---------------------------------------------------------------------------
// Property 6 reference model: Insert or Delete over per-unit pieces.
// ---------------------------------------------------------------------------

type InsertOrDelete = Insert | Delete;

/** Effective provenance of an Insert (Req 6.11): `AI` under a relabelled Run is `AI>HUM`. */
function effectiveOrigin(doc: Document, op: Insert): Origin {
  const r = runIdOf(op.provenance);
  const relabelled = doc.runs.some((e) => e.runId === r && e.relabelled);
  return op.provenance.origin === "AI" && relabelled ? "AI>HUM" : op.provenance.origin;
}

/** Edited-count increments per Run_Id for this op (Req 6.1, 6.2, 6.7). */
function editedDelta(doc: Document, op: InsertOrDelete): ReadonlyMap<string, number> {
  const delta = new Map<string, number>();
  const bump = (r: string, n: number): void => void delta.set(r, (delta.get(r) ?? 0) + n);
  if (op.kind === "delete") {
    if (op.actor !== "HUM") return delta;
    for (const u of unitsOf(doc).slice(op.from, op.to)) {
      if (u.origin === "AI" && u.runId !== null) bump(u.runId, 1);
    }
    return delta;
  }
  if (op.provenance.origin !== "HUM") return delta;
  for (const [r, [start, end]] of runExtents(doc.spans)) {
    if (start < op.at && op.at < end) bump(r, op.text.length);
  }
  return delta;
}

const isEmptyOp = (op: InsertOrDelete): boolean =>
  op.kind === "delete" ? op.from === op.to : op.text.length === 0;

/**
 * Run_Ids that cross the threshold with this op (Req 6.3, 6.4, 6.8). An
 * empty op relabels nothing: Req 4.7 returns the input Document, even when
 * a lower threshold than the one `doc` was built under puts a Run over it.
 */
function newlyRelabelled(doc: Document, op: InsertOrDelete, threshold: number): Set<string> {
  const crossed = new Set<string>();
  if (isEmptyOp(op)) return crossed;
  const delta = editedDelta(doc, op);
  for (const e of doc.runs) {
    const added =
      op.kind === "insert" && runIdOf(op.provenance) === e.runId && op.provenance.origin === "AI"
        ? op.text.length
        : 0;
    const edited = e.editedCount + (delta.get(e.runId) ?? 0);
    if (!e.relabelled && edited / (e.originalLength + added) > threshold) crossed.add(e.runId);
  }
  return crossed;
}

/** The unmerged spliced pieces for `op` (Req 4.1, 4.4, 4.11). */
function splicedUnits(doc: Document, op: InsertOrDelete): readonly Unit[] {
  const old = unitsOf(doc);
  if (op.kind === "delete") return [...old.slice(0, op.from), ...old.slice(op.to)];
  const p = op.provenance;
  const inserted = unitsFor(op.text, effectiveOrigin(doc, op), runIdOf(p), p.timestamp);
  return [...old.slice(0, op.at), ...inserted, ...old.slice(op.at)];
}

/** Expected per-unit provenance after `op`, including any relabelling it causes. */
function modelUnits(doc: Document, op: InsertOrDelete, threshold: number): readonly Unit[] {
  const crossed = newlyRelabelled(doc, op, threshold);
  const relabel = (u: Unit): Unit =>
    u.origin === "AI" && u.runId !== null && crossed.has(u.runId) ? { ...u, origin: "AI>HUM" } : u;
  return mergeUnits(splicedUnits(doc, op).map(relabel));
}

const modelText = (doc: Document, op: InsertOrDelete): string =>
  op.kind === "delete"
    ? doc.text.slice(0, op.from) + doc.text.slice(op.to)
    : doc.text.slice(0, op.at) + op.text + doc.text.slice(op.at);

const lengthsOf = (entries: readonly RunEntry[]): readonly (readonly [string, number])[] =>
  entries.map((e) => [e.runId, e.originalLength] as const);

const T0 = "2026-11-03T10:00:00Z";
const T1 = "2026-11-03T10:05:00Z";

/** The Document `apply` returns; fails the test on an Engine_Error. */
function applied(doc: Document, op: InsertOrDelete, config?: EngineConfig): Document {
  const result = apply(doc, op, config);
  if (!result.ok) throw new Error(`fixture: apply failed with ${result.error.kind}`);
  return result.value.document;
}

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe("Property 6: Insert and Delete agree with a per-code-unit model _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.7, 4.11, 4.12_", () => {
  it("matches the model's Text and per-Offset (Origin, Run_Id, Timestamp)", () => {
    const arbCase = fc
      .tuple(arbDocument, arbThreshold)
      .chain(([doc, setting]) => arbCallerInsertOrDelete(doc).map((op) => ({ doc, setting, op })));
    // Property 6
    fc.assert(
      fc.property(arbCase, ({ doc, setting, op }) => {
        const result = apply(doc, op, setting.config);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const next = result.value.document;
        expect(next.text).toBe(modelText(doc, op));
        expect(unitsOf(next)).toEqual(modelUnits(doc, op, setting.threshold));
        if (isEmptyOp(op)) expect(structuralEqual(next, doc)).toBe(true);
        if (op.kind === "delete") expect(lengthsOf(next.runs)).toEqual(lengthsOf(doc.runs));
      }),
      runs(),
    );
  });

  // Shrunk from seed -1752189824: an empty Insert under a threshold below a
  // Run's Edited_Proportion still returns the input Document (Req 4.7).
  it("an empty op under a lower threshold relabels nothing", () => {
    const created = createDocument("abcdefghij", T0);
    if (!created.ok) throw new Error("fixture: createDocument failed");
    const ai: Provenance = { origin: "AI", runId: "r1", timestamp: T1 };
    const withAi = applied(created.value, {
      kind: "insert",
      at: 0,
      text: "0123456789",
      provenance: ai,
    });
    const doc = applied(withAi, { kind: "delete", from: 2, to: 3, actor: "HUM" });
    expect(doc.runs).toEqual([
      { runId: "r1", originalLength: 10, editedCount: 1, relabelled: false },
    ]);
    const empty: Insert = { kind: "insert", at: 0, text: "", provenance: ai };
    expect(applied(doc, empty, { relabelThreshold: 0.05 })).toBe(doc);
  });
});

describe("Property 7: Replace equals Delete followed by Insert _Requirements: 4.6, 6.9_", () => {
  it("apply(d, Replace) is structurally equal to Delete then Insert, with one Inverse back to d", () => {
    const arbCase = fc
      .tuple(arbDocument, arbThreshold)
      .chain(([doc, setting]) => arbReplace(doc).map((op) => ({ doc, setting, op })));
    // Property 7
    fc.assert(
      fc.property(arbCase, ({ doc, setting, op }) => {
        const { config } = setting;
        const result = apply(doc, op, config);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const del: Delete = {
          kind: "delete",
          from: op.from,
          to: op.to,
          actor: op.provenance.origin,
        };
        const ins: Insert = {
          kind: "insert",
          at: op.from,
          text: op.text,
          provenance: op.provenance,
        };
        const sequential = applied(applied(doc, del, config), ins, config);
        expect(result.value.document).toEqual(sequential);
        expect(structuralEqual(result.value.document, sequential)).toBe(true);
        const undone = apply(result.value.document, result.value.inverse, config);
        expect(undone.ok).toBe(true);
        if (undone.ok) expect(structuralEqual(undone.value.document, doc)).toBe(true);
      }),
      runs(),
    );
  });

  // Req 6.9: the delete alone leaves r1 at 2/10, under 0.4; the insert inside
  // the Run_Extent brings it to 7/10, so the Replace relabels r1, as the
  // sequential Delete then Insert does.
  it("a Replace that crosses the threshold only after both counts relabels like the sequence", () => {
    const created = createDocument("abcdefghij", T0);
    if (!created.ok) throw new Error("fixture: createDocument failed");
    const ai: Provenance = { origin: "AI", runId: "r1", timestamp: T1 };
    const doc = applied(created.value, {
      kind: "insert",
      at: 0,
      text: "0123456789",
      provenance: ai,
    });
    const hum: Provenance = { origin: "HUM", timestamp: T1 };
    const del: Delete = { kind: "delete", from: 1, to: 3, actor: "HUM" };
    expect(applied(doc, del).runs).toEqual([
      { runId: "r1", originalLength: 10, editedCount: 2, relabelled: false },
    ]);
    const result = apply(doc, { kind: "replace", from: 1, to: 3, text: "xxxxx", provenance: hum });
    if (!result.ok) throw new Error("fixture: replace failed");
    const sequential = applied(applied(doc, del), {
      kind: "insert",
      at: 1,
      text: "xxxxx",
      provenance: hum,
    });
    expect(result.value.document.runs).toEqual([
      { runId: "r1", originalLength: 10, editedCount: 7, relabelled: true },
    ]);
    expect(structuralEqual(result.value.document, sequential)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Property 8 helpers: walk a trace forward, then undo it and redo each step.
// ---------------------------------------------------------------------------

/** `apply(doc, inv)` must succeed and return exactly one Inverse (Req 5.1, 5.5). */
function appliedInverse(doc: Document, inv: Inverse, config?: EngineConfig): Applied {
  const result = apply(doc, inv, config);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`apply(inverse) failed with ${result.error.kind}`);
  expect(result.value.inverse.kind).toBe("inverse");
  return result.value;
}

/** Full Document equality: the engine's structural check and a deep field-by-field one. */
function expectSameDocument(actual: Document, expected: Document): void {
  expect(structuralEqual(actual, expected)).toBe(true);
  expect(actual).toEqual(expected);
}

/** `d0 … dn` and `i1 … in` from a trace whose every step must succeed (Req 5.1). */
function forwardChain(d0: Document, steps: readonly OpStep[]): [Document[], Inverse[]] {
  const docs: Document[] = [d0];
  const inverses: Inverse[] = [];
  for (const { result } of steps) {
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`apply failed with ${result.error.kind}`);
    expect(result.value.inverse.kind).toBe("inverse");
    docs.push(result.value.document);
    inverses.push(result.value.inverse);
  }
  return [docs, inverses];
}

describe("Property 8: Undo and redo restore documents exactly _Requirements: 4.7, 5.1, 5.3, 5.4, 5.5, 5.6_", () => {
  it("applying in … i1 returns dn−1 … d0, and each redo Inverse returns the undone Document", () => {
    const arbCase = fc
      .tuple(arbDocument, arbThreshold)
      .chain(([doc, setting]) =>
        arbOpTrace(doc, setting.config).map((steps) => ({ doc, setting, steps })),
      );
    // Property 8
    fc.assert(
      fc.property(arbCase, ({ doc, setting, steps }) => {
        const { config } = setting;
        const [docs, inverses] = forwardChain(doc, steps);
        let current = docs[docs.length - 1] as Document;
        for (let k = inverses.length; k >= 1; k--) {
          const undone = appliedInverse(current, inverses[k - 1] as Inverse, config);
          expectSameDocument(undone.document, docs[k - 1] as Document);
          const redone = appliedInverse(undone.document, undone.inverse, config);
          expectSameDocument(redone.document, docs[k] as Document);
          current = undone.document;
        }
      }),
      runs(),
    );
  });
});
