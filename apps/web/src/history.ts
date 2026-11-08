import { apply, err, ok } from "@reveal-codes/engine";
import type { CallerOperation, Document, EngineError, Inverse, Result } from "@reveal-codes/engine";

/** Where the last coalescable typing insert ended, and when (injected clock, ms). */
export type TypingMark = Readonly<{ endOffset: number; atMs: number }>;

/** One Undo_Group (or Redo_Group), stored in chronological application order. */
export type UndoEntry = Readonly<{ group: readonly Inverse[]; typing: TypingMark | null }>;

export type Stepped = Readonly<{
  document: Document;
  produced: readonly Inverse[];
  caret: number;
}>;

export const COALESCE_WINDOW_MS = 1000;

function codePointCount(text: string): number {
  return Array.from(text).length;
}

/** The typing mark an edit would leave, or null unless it is one HUM one-code-point insert. */
function markFor(ops: readonly CallerOperation[], nowMs: number): TypingMark | null {
  const op = ops.length === 1 ? ops[0] : undefined;
  if (op === undefined || op.kind !== "insert") return null;
  if (op.provenance.origin !== "HUM" || codePointCount(op.text) !== 1) return null;
  return { endOffset: op.at + op.text.length, atMs: nowMs };
}

function coalesces(top: UndoEntry | undefined, at: number, nowMs: number): boolean {
  if (top === undefined || top.typing === null) return false;
  return at === top.typing.endOffset && nowMs - top.typing.atMs <= COALESCE_WINDOW_MS;
}

/** Push the Inverses of a successful edit; coalesce single-character typing (Requirement 8.3). */
export function pushEdit(
  undo: readonly UndoEntry[],
  inverses: readonly Inverse[],
  ops: readonly CallerOperation[],
  nowMs: number,
): readonly UndoEntry[] {
  if (inverses.length === 0) return undo;
  const mark = markFor(ops, nowMs);
  const top = undo[undo.length - 1];
  const op = ops[0];
  if (mark !== null && op !== undefined && op.kind === "insert" && coalesces(top, op.at, nowMs)) {
    const merged: UndoEntry = { group: [...(top?.group ?? []), ...inverses], typing: mark };
    return [...undo.slice(0, -1), merged];
  }
  return [...undo, { group: inverses, typing: mark }];
}

function applyAll(doc: Document, inverses: readonly Inverse[]): Result<Stepped, EngineError> {
  let current = doc;
  const produced: Inverse[] = [];
  let caret = 0;
  for (const inverse of inverses) {
    const result = apply(current, inverse);
    if (!result.ok) return err(result.error);
    current = result.value.document;
    produced.push(result.value.inverse);
    caret = inverse.restore.at + inverse.restore.insertText.length;
  }
  return ok({ document: current, produced, caret });
}

/** Undo: apply the group reversed. `produced` is the chronological redo group. */
export function runUndo(doc: Document, entry: UndoEntry): Result<Stepped, EngineError> {
  const result = applyAll(doc, [...entry.group].reverse());
  if (!result.ok) return result;
  return ok({ ...result.value, produced: [...result.value.produced].reverse() });
}

/** Redo: apply the group forward. `produced` is the chronological undo group. */
export function runRedo(doc: Document, entry: UndoEntry): Result<Stepped, EngineError> {
  return applyAll(doc, entry.group);
}
