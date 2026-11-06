/**
 * Property 7 models (design A4): a Replace as the two Operations it must
 * equal, and the citation layer of one re-anchor over its combined edit.
 */
import { withLayer } from "../../src/anchor";
import { reanchorStage } from "../../src/citation-layer";
import { apply } from "../../src/document";
import type {
  CallerOperation,
  Delete,
  Document,
  EngineConfig,
  Insert,
  Replace,
} from "../../src/types";

/** The Document `apply` returns; fails the test on an Engine_Error. */
export function applied(doc: Document, op: CallerOperation, config?: EngineConfig): Document {
  const result = apply(doc, op, config);
  if (!result.ok) throw new Error(`fixture: apply failed with ${result.error.kind}`);
  return result.value.document;
}

/** Delete(from, to, p.origin) then Insert(from, text, p), as two Operations. */
export function sequentialReplace(doc: Document, op: Replace, config?: EngineConfig): Document {
  const del: Delete = { kind: "delete", from: op.from, to: op.to, actor: op.provenance.origin };
  const ins: Insert = { kind: "insert", at: op.from, text: op.text, provenance: op.provenance };
  return applied(applied(doc, del, config), ins, config);
}

/**
 * The Document whose Text, Spans, and Run table are `next`'s and whose
 * citation layer is `doc` re-anchored once with the Replace's combined edit
 * `[from, to) → [from, from + text.length)` (design A4).
 */
export function reanchoredOnce(doc: Document, op: Replace, next: Document): Document {
  const draft = { text: next.text, spans: next.spans, runs: next.runs };
  const edit = { from: op.from, oldTo: op.to, newTo: op.from + op.text.length };
  return withLayer(draft, reanchorStage({ prev: doc, draft, edit }));
}
