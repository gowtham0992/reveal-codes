/**
 * Snapshot-based Inverses (design A7; Req 5.1, 5.3-5.7). An Inverse holds a
 * reference to the post-operation Document, a text patch, and the
 * pre-operation arrays (shared, not copied). Applying one restores the
 * snapshot: it does not validate, relabel, or re-extract, so the restored
 * Document equals the pre-operation Document by construction.
 */
import { structuralEqual } from "../equal.js";
import type { StaleInverse } from "../errors.js";
import { err, ok, type Result } from "../result.js";
import type { Applied, Document, Inverse } from "../types.js";
import { spliceText } from "./splice.js";

/**
 * Inverse of an edit that turned `prev` into `next` by replacing
 * `removedText` at `at` with `insertedLength` code units. O(1) apart from
 * the caller's `removedText` slice.
 */
export function makeInverse(
  prev: Document,
  next: Document,
  at: number,
  removedText: string,
  insertedLength: number,
): Inverse {
  return {
    kind: "inverse",
    expect: next,
    restore: {
      at,
      removeLength: insertedLength,
      insertText: removedText,
      spans: prev.spans,
      runs: prev.runs,
      citations: prev.citations,
      quotes: prev.quotes,
      overrides: prev.overrides,
      keyCounter: prev.keyCounter,
    },
  };
}

/** Req 5.7: the Inverse applies only to a Document equal to its `expect`. */
function isCurrent(doc: Document, inv: Inverse): boolean {
  return doc === inv.expect || structuralEqual(doc, inv.expect);
}

/** The Document an Inverse restores when applied to `inv.expect`. */
function restored(inv: Inverse): Document {
  const r = inv.restore;
  return {
    text: spliceText(inv.expect.text, r.at, r.at + r.removeLength, r.insertText),
    spans: r.spans,
    runs: r.runs,
    citations: r.citations,
    quotes: r.quotes,
    overrides: r.overrides,
    keyCounter: r.keyCounter,
  };
}

/**
 * Redo Inverse for `inv`: applied to the restored Document it returns
 * `inv.expect`. The reverse patch removes the restored text and puts back
 * what `inv` removed.
 */
export function redo(inv: Inverse, restoredDoc: Document): Inverse {
  const { at, removeLength, insertText } = inv.restore;
  const removedByUndo = inv.expect.text.slice(at, at + removeLength);
  return makeInverse(inv.expect, restoredDoc, at, removedByUndo, insertText.length);
}

/**
 * Design A7. Returns `stale_inverse` when `doc` is neither `inv.expect` nor
 * structurally equal to it; otherwise the restored Document and its redo
 * Inverse. `doc` is never mutated.
 */
export function applyInverse(doc: Document, inv: Inverse): Result<Applied, StaleInverse> {
  if (!isCurrent(doc, inv)) return err({ kind: "stale_inverse" });
  const document = restored(inv);
  return ok({ document, inverse: redo(inv, document) });
}
