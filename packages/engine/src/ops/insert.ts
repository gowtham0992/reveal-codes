/**
 * Insert pipeline (design A3 steps 1 to 8; Req 4.1-4.3, 4.8, 4.9, 4.11,
 * 4.12, 6.2, 6.7, 6.11). The caller (`apply`, task 2.12) has validated the
 * operation and the threshold and has handled the empty-text no-op.
 */
import type { DraftDocument, Edit } from "../anchor.js";
import type { InvalidSpans } from "../errors.js";
import { addOriginalLength, countInserted } from "../relabel.js";
import { ok, type Result } from "../result.js";
import type { Applied, Document, Insert, Provenance } from "../types.js";
import { makeInverse } from "./inverse.js";
import { finishDraft } from "./pipeline.js";
import { effectiveProvenance, spliceSpans, spliceText } from "./splice.js";

/** The primitive edit an Insert of `length` code units at `at` performs. */
export function insertEdit(at: number, length: number): Edit {
  return { from: at, oldTo: at, newTo: at + length };
}

/**
 * Design A3 steps 1 to 4 and 6 for an Insert, without relabelling. The
 * Original_Length uses the caller's provenance (Req 4.8, 6.11), the edited
 * counts use the spans before the insertion (Req 6.2), and the new piece
 * carries the effective provenance (Req 6.11).
 */
export function insertDraft(
  doc: DraftDocument,
  at: number,
  text: string,
  provenance: Provenance,
): DraftDocument {
  const length = text.length;
  const counted = countInserted(
    addOriginalLength(doc.runs, provenance, length),
    provenance.origin,
    doc.spans,
    at,
    length,
  );
  const piece = {
    start: at,
    end: at + length,
    provenance: effectiveProvenance(provenance, doc.runs),
  };
  const { spans } = spliceSpans(doc.spans, at, at, piece);
  return { text: spliceText(doc.text, at, at, text), spans, runs: counted };
}

/**
 * Applies a validated, non-empty Insert. Returns the new Document and an
 * Inverse that restores `doc` (design A3 step 8). The error case cannot
 * occur for a canonical `doc` (see `relabelDraft`).
 */
export function applyInsert(
  doc: Document,
  op: Insert,
  threshold: number,
): Result<Applied, InvalidSpans> {
  const draft = insertDraft(doc, op.at, op.text, op.provenance);
  const next = finishDraft(doc, draft, insertEdit(op.at, op.text.length), threshold);
  if (!next.ok) return next;
  const document = next.value;
  return ok({ document, inverse: makeInverse(doc, document, op.at, "", op.text.length) });
}
