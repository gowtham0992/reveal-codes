/**
 * Replace composition (design A4; Req 4.6, 6.9, 15.3, 15.4). Replace builds
 * its Text, Spans, and Run table as Delete followed by Insert would. Its
 * citation layer comes from one re-anchor of the original Document over the
 * combined Edit `[from, to) → [from, from + text.length)`, so a citation
 * that the Replace touches gets one fresh Issue_Key and one that it leaves
 * untouched under Req 15.3 keeps its key, result, and Override. Relabelling
 * runs once, after both counts (Req 6.9); the Text, Spans, and Run table
 * still equal the sequential composition because counts only grow, flags
 * are sticky, and the Run invariant (Req 6.12) means a relabel never merges
 * spans that the insert could have split. One Inverse restores the original
 * Document.
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
 * Text, Spans, and Run table after the Replace, before relabelling: the
 * Delete draft, then the Insert draft counted against the post-delete spans
 * (Req 6.9). Neither step re-anchors.
 */
export function replaceDraft(doc: DraftDocument, op: Replace): DraftDocument {
  const deleted = deleteDraft(doc, op.from, op.to, op.provenance.origin);
  return insertDraft(deleted, op.from, op.text, op.provenance);
}

/**
 * Both halves when the range and the text are non-empty: one relabel after
 * both counts, then one re-anchor against `doc` with the combined Edit.
 */
function bothStages(doc: Document, op: Replace, threshold: number): Result<Document, InvalidSpans> {
  const relabelled = relabelDraft(replaceDraft(doc, op), threshold);
  if (!relabelled.ok) return relabelled;
  const edit = replaceEdit(op.from, op.to, op.text.length);
  return ok(settleDraft(doc, relabelled.value, edit));
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
