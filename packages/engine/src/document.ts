/**
 * Document creation, normalisation, and the `apply` dispatcher (design A1,
 * A2; Req 2, 3.4, 4.7, 4.10, 5.1, 5.2, 7.7).
 */
import { creationEdit, reanchorStage, withLayer, type DraftDocument } from "./anchor.js";
import type { EngineError, InvalidSpans } from "./errors.js";
import {
  applyDelete,
  applyInsert,
  applyInverse,
  applyReplace,
  makeInverse,
  validateCallerOp,
  validateConfig,
} from "./ops.js";
import { err, ok, type Result } from "./result.js";
import { normaliseSpans } from "./spans.js";
import type { Applied, CallerOperation, Document, EngineConfig, Operation, Span } from "./types.js";
import { firstUnpairedSurrogate, isTimestamp } from "./validate.js";

/**
 * Creates a Document from pasted text (Req 2.1, 2.2, 2.6, 2.7).
 *
 * Validation order (design A1): `invalid_timestamp` first, then
 * `split_surrogate` at the first unpaired surrogate. On success the Text is
 * `text` unchanged, the Spans are one `PST` span over the whole Text (none
 * for empty text), the Run table and Overrides are empty, and the citation
 * layer comes from `reanchorStage`.
 */
export function createDocument(text: string, timestamp: string): Result<Document, EngineError> {
  if (!isTimestamp(timestamp)) return err({ kind: "invalid_timestamp", value: timestamp });
  const surrogate = firstUnpairedSurrogate(text);
  if (surrogate !== null) {
    // `text`: an unpaired surrogate inside a supplied string, as for an
    // operation's inserted text; here the Offset is also a Document Offset.
    return err({ kind: "split_surrogate", offset: surrogate, where: "text" });
  }
  const spans: readonly Span[] =
    text.length === 0
      ? []
      : [{ start: 0, end: text.length, provenance: { origin: "PST", timestamp } }];
  const draft: DraftDocument = { text, spans, runs: [] };
  const layer = reanchorStage({ prev: null, draft, edit: creationEdit(text.length) });
  return ok(withLayer(draft, layer));
}

/**
 * Normalisation of a Document (Req 3.3–3.6): checks the Coverage_Invariant
 * against the Text length and merges Mergeable runs, keeping each merged
 * span's lowest-start Timestamp. Every other field is returned unchanged, so
 * normalising a Canonical_Document returns an equal Document (Req 3.4).
 */
export function normalise(doc: Document): Result<Document, EngineError> {
  const spans = normaliseSpans(doc.text.length, doc.spans);
  if (!spans.ok) return spans;
  return ok({ ...doc, spans: spans.value });
}

/**
 * The edit position of a validated Caller_Operation when it is a no-op under
 * Req 4.7 (empty inserted text over an empty range), or `null` otherwise.
 */
function noOpAt(op: CallerOperation): number | null {
  if (op.kind === "insert") return op.text.length === 0 ? op.at : null;
  if (op.kind === "delete") return op.from === op.to ? op.from : null;
  return op.from === op.to && op.text.length === 0 ? op.from : null;
}

/** Design A2 step 5: routes a validated, non-no-op Caller_Operation. */
function dispatch(
  doc: Document,
  op: CallerOperation,
  threshold: number,
): Result<Applied, InvalidSpans> {
  if (op.kind === "insert") return applyInsert(doc, op, threshold);
  if (op.kind === "delete") return applyDelete(doc, op, threshold);
  return applyReplace(doc, op, threshold);
}

/**
 * Applies an Operation to `doc` (design A2). In order: `validateConfig`
 * (so an invalid threshold is rejected even for an Inverse), Inverse
 * routing to `applyInverse` (Req 5.7), `validateCallerOp` (Req 7), the
 * no-op case (Req 4.7, 4.10), which returns `doc` itself with an Inverse
 * that restores it, and dispatch to Insert, Delete, or Replace.
 *
 * On failure the error is returned and `doc` is untouched (Req 5.2); on
 * success exactly one Inverse is returned (Req 5.1).
 */
export function apply(
  doc: Document,
  op: Operation,
  config?: EngineConfig,
): Result<Applied, EngineError> {
  const threshold = validateConfig(config);
  if (!threshold.ok) return threshold;
  if (op.kind === "inverse") return applyInverse(doc, op);
  const valid = validateCallerOp(doc, op);
  if (!valid.ok) return valid;
  const at = noOpAt(valid.value);
  if (at !== null) return ok({ document: doc, inverse: makeInverse(doc, doc, at, "", 0) });
  return dispatch(doc, valid.value, threshold.value);
}
