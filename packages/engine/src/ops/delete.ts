/**
 * Delete pipeline (design A3 steps 1 to 8; Req 4.4, 4.5, 4.11, 6.1, 6.7).
 * The caller (`apply`, task 2.12) has validated the operation and the
 * threshold and has handled the empty-range no-op.
 */
import type { DraftDocument, Edit } from "../anchor.js";
import type { InvalidSpans } from "../errors.js";
import { countDeleted } from "../relabel.js";
import { ok, type Result } from "../result.js";
import type { Applied, Delete, Document, Origin } from "../types.js";
import { makeInverse } from "./inverse.js";
import { finishDraft } from "./pipeline.js";
import { spliceSpans, spliceText } from "./splice.js";

/** The primitive edit a Delete of [from, to) performs. */
export function deleteEdit(from: number, to: number): Edit {
  return { from, oldTo: to, newTo: from };
}

/**
 * Design A3 steps 2, 4, and 6 for a Delete, without relabelling. The Run
 * table keeps every entry and Original_Length (Req 4.5); with Actor `HUM`
 * the deleted `AI` code units are counted per Run (Req 6.1).
 */
export function deleteDraft(
  doc: DraftDocument,
  from: number,
  to: number,
  actor: Origin,
): DraftDocument {
  const { spans, deletedPieces } = spliceSpans(doc.spans, from, to, null);
  return {
    text: spliceText(doc.text, from, to, ""),
    spans,
    runs: countDeleted(doc.runs, actor, deletedPieces),
  };
}

/**
 * Applies a validated Delete with `from < to`. Returns the new Document and
 * an Inverse that restores `doc` (design A3 step 8). The error case cannot
 * occur for a canonical `doc` (see `relabelDraft`).
 */
export function applyDelete(
  doc: Document,
  op: Delete,
  threshold: number,
): Result<Applied, InvalidSpans> {
  const draft = deleteDraft(doc, op.from, op.to, op.actor);
  const next = finishDraft(doc, draft, deleteEdit(op.from, op.to), threshold);
  if (!next.ok) return next;
  const document = next.value;
  const removed = doc.text.slice(op.from, op.to);
  return ok({ document, inverse: makeInverse(doc, document, op.from, removed, 0) });
}
