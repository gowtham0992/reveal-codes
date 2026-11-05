/**
 * Document creation and normalisation (design A1, Req 2, Req 3.4).
 * `apply` joins this module in task 2.12.
 */
import { creationEdit, reanchorStage, withLayer, type DraftDocument } from "./anchor.js";
import type { EngineError } from "./errors.js";
import { err, ok, type Result } from "./result.js";
import { normaliseSpans } from "./spans.js";
import type { Document, Span } from "./types.js";
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
