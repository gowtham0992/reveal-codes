/**
 * Replace composition (design A4; Req 4.6, 6.9, 15.3, 15.4). Replace builds
 * its Text, Spans, and Run table as Delete followed by Insert would,
 * relabelling after the delete step and again after the insert step. One
 * relabel after both steps is not enough: an AI insert under the same Run
 * grows its Original_Length, so a crossing that the delete step makes under
 * a lowered threshold can be undone by the time both counts are in. Its
 * citation layer comes from one re-anchor of the original Document over the
 * combined Edit `[from, to) → [from, from + text.length)`, so a citation
 * that the Replace touches gets one fresh Issue_Key and one that it leaves
 * untouched under Req 15.3 keeps its key, result, and Override. One Inverse,
 * built from snapshots, restores the original Document.
 */
import type { DraftDocument, Edit } from "../anchor.js";
import type { InvalidSpans } from "../errors.js";
import { ok, type Result } from "../result.js";
import type { Applied, Document, Replace } from "../types.js";
import { applyDelete, deleteDraft } from "./delete.js";
import { applyInsert, insertDraft } from "./insert.js";
import { makeInverse } from "./inverse.js";
import { relabelDraft, settleDraft } from "./pipeline.js";

/** The single Edit a Replace performs: `[from, to) → [from, from + |text|)`. */
export function replaceEdit(from: number, to: number, length: number): Edit {
  return { from, oldTo: to, newTo: from + length };
}

/**
 * Text, Spans, and Run table after the Replace: the Delete draft relabelled,
 * then the Insert draft, counted against the post-delete spans (Req 6.9),
 * relabelled again. Neither step re-anchors.
 */
export function replaceDraft(
  doc: DraftDocument,
  op: Replace,
  threshold: number,
): Result<DraftDocument, InvalidSpans> {
  const deleted = relabelDraft(deleteDraft(doc, op.from, op.to, op.provenance.origin), threshold);
  if (!deleted.ok) return deleted;
  return relabelDraft(insertDraft(deleted.value, op.from, op.text, op.provenance), threshold);
}

/**
 * Both halves when the range and the text are non-empty: the relabelled
 * draft, then one re-anchor against `doc` with the combined Edit.
 */
function bothStages(doc: Document, op: Replace, threshold: number): Result<Document, InvalidSpans> {
  const draft = replaceDraft(doc, op, threshold);
  if (!draft.ok) return draft;
  const edit = replaceEdit(op.from, op.to, op.text.length);
  return ok(settleDraft(doc, draft.value, edit));
}

/**
 * Applies a validated Replace that is not a no-op. Its Text, Spans, and Run
 * table equal Delete(from, to, provenance.origin) followed by Insert(from,
 * text, provenance). With empty `text` it is the Delete alone, and with
 * `from == to` the Insert alone; the combined Edit then equals that
 * primitive's Edit. The error case cannot occur for a canonical `doc`.
 */
export function applyReplace(
  doc: Document,
  op: Replace,
  threshold: number,
): Result<Applied, InvalidSpans> {
  const { from, to, text, provenance } = op;
  if (text.length === 0)
    return applyDelete(doc, { kind: "delete", from, to, actor: provenance.origin }, threshold);
  if (from === to)
    return applyInsert(doc, { kind: "insert", at: from, text, provenance }, threshold);
  const next = bothStages(doc, op, threshold);
  if (!next.ok) return next;
  const document = next.value;
  const removed = doc.text.slice(from, to);
  return ok({ document, inverse: makeInverse(doc, document, from, removed, text.length) });
}
