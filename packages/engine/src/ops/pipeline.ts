/**
 * Shared tail of the Insert and Delete pipeline (design A3 steps 5 and 7).
 * The draft stages in ops/insert.ts and ops/delete.ts settle Text, Spans,
 * and counts; `relabelDraft` applies step 5 and `settleDraft` step 7. They
 * are separate so that Replace can relabel once after both counts while
 * re-anchoring after each primitive edit (design A4, Req 6.9).
 */
import { reanchorStage, withLayer, type DraftDocument, type Edit } from "../anchor.js";
import type { InvalidSpans } from "../errors.js";
import { relabelRuns } from "../relabel.js";
import { ok, type Result } from "../result.js";
import type { Document } from "../types.js";

/**
 * Design A3 step 5: relabels every Run whose Edited_Proportion is strictly
 * above `threshold`. The error case reports a non-canonical span list and
 * cannot occur for spans produced by `spliceSpans`.
 */
export function relabelDraft(
  draft: DraftDocument,
  threshold: number,
): Result<DraftDocument, InvalidSpans> {
  const relabelled = relabelRuns(draft.spans, draft.runs, threshold);
  if (!relabelled.ok) return relabelled;
  const { spans, runs } = relabelled.value;
  if (spans === draft.spans && runs === draft.runs) return ok(draft);
  return ok({ text: draft.text, spans, runs });
}

/** Design A3 step 7: derives the citation layer of `draft` from `prev` and `edit`. */
export function settleDraft(prev: Document, draft: DraftDocument, edit: Edit): Document {
  return withLayer(draft, reanchorStage({ prev, draft, edit }));
}

/** Steps 5 and 7 together, as one primitive Insert or Delete runs them. */
export function finishDraft(
  prev: Document,
  draft: DraftDocument,
  edit: Edit,
  threshold: number,
): Result<Document, InvalidSpans> {
  const relabelled = relabelDraft(draft, threshold);
  if (!relabelled.ok) return relabelled;
  return ok(settleDraft(prev, relabelled.value, edit));
}
