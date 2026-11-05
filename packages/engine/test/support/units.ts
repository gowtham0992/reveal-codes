/**
 * Property 6 reference model (design "Correctness Properties", [ops];
 * Req 4.1–4.5, 4.7, 4.11, 4.12, 6.1–6.4, 6.7, 6.8, 6.11): a per-code-unit
 * view of a Document's provenance and the Insert or Delete over it. Kept
 * here so ops.properties.test.ts stays under the 300-line module limit.
 */
import type { Delete, Document, Insert, Origin, Provenance, RunEntry, Span } from "../../src/types";

/** One code unit: its character and the provenance covering it. */
export type Unit = Readonly<{
  char: string;
  origin: Origin;
  runId: string | null;
  timestamp: string;
}>;

export type InsertOrDelete = Insert | Delete;

const runIdOf = (p: Provenance): string | null =>
  Object.prototype.hasOwnProperty.call(p, "runId") ? (p.runId ?? null) : null;

/** Mergeable (Glossary): same Origin and same Run_Id or both absent. */
const mergeable = (a: Unit, b: Unit): boolean => a.origin === b.origin && a.runId === b.runId;

/** What a Document says at each Offset: its character and its Span's record. */
export function unitsOf(doc: Document): readonly Unit[] {
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

export const isEmptyOp = (op: InsertOrDelete): boolean =>
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
export function modelUnits(doc: Document, op: InsertOrDelete, threshold: number): readonly Unit[] {
  const crossed = newlyRelabelled(doc, op, threshold);
  const relabel = (u: Unit): Unit =>
    u.origin === "AI" && u.runId !== null && crossed.has(u.runId) ? { ...u, origin: "AI>HUM" } : u;
  return mergeUnits(splicedUnits(doc, op).map(relabel));
}

export const modelText = (doc: Document, op: InsertOrDelete): string =>
  op.kind === "delete"
    ? doc.text.slice(0, op.from) + doc.text.slice(op.to)
    : doc.text.slice(0, op.at) + op.text + doc.text.slice(op.at);

export const lengthsOf = (entries: readonly RunEntry[]): readonly (readonly [string, number])[] =>
  entries.map((e) => [e.runId, e.originalLength] as const);
