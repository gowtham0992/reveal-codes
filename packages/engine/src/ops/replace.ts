/**
 * Replace composition (design A4; Req 4.6, 6.9, 15.4). Replace runs the
 * Delete stage and then the Insert stage. Each stage re-anchors, exactly as
 * Delete followed by Insert would, so Issue_Keys and the counter match the
 * sequential composition. Relabelling runs once, after both counts
 * (Req 6.9); the result still equals the sequential composition because
 * counts only grow, flags are sticky, and the Run invariant (Req 6.12)
 * means a relabel never merges spans that the insert could have split.
 * One Inverse restores the original Document.
 */
import type { InvalidSpans } from "../errors.js";
import { ok, type Result } from "../result.js";
import type { Applied, Document, Replace } from "../types.js";
import { applyDelete, deleteDraft, deleteEdit } from "./delete.js";
import { applyInsert, insertDraft, insertEdit } from "./insert.js";
import { makeInverse } from "./inverse.js";
import { relabelDraft, settleDraft } from "./pipeline.js";

/**
 * Both stages when the range and the text are non-empty: the Delete stage
 * re-anchors against `doc`, the Insert stage counts against the post-delete
 * spans (Req 6.9) and re-anchors against the post-delete Document, and
 * relabelling runs once in between the Insert counts and its re-anchor.
 */
function bothStages(doc: Document, op: Replace, threshold: number): Result<Document, InvalidSpans> {
  const deleted = deleteDraft(doc, op.from, op.to, op.provenance.origin);
  const mid = settleDraft(doc, deleted, deleteEdit(op.from, op.to));
  const inserted = insertDraft(mid, op.from, op.text, op.provenance);
  const relabelled = relabelDraft(inserted, threshold);
  if (!relabelled.ok) return relabelled;
  return ok(settleDraft(mid, relabelled.value, insertEdit(op.from, op.text.length)));
}

/**
 * Applies a validated Replace that is not a no-op. Equals Delete(from, to,
 * provenance.origin) followed by Insert(from, text, provenance). With empty
 * `text` it is the Delete alone, and with `from == to` the Insert alone,
 * because the other half is a no-op under Req 4.7 that must not re-anchor.
 * The error case cannot occur for a canonical `doc` (see `relabelDraft`).
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
