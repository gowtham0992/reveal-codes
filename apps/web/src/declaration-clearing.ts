import { holdsSubstantivePasted, insertsPasted } from "@reveal-codes/engine";
import type { Declaration, Document, Operation } from "@reveal-codes/engine";

/** True when any operation put a PST character into the Document. */
export function insertedPasted(operations: readonly Operation[]): boolean {
  return operations.some(insertsPasted);
}

/**
 * The stored Declaration after a change: cleared when pasted text was inserted,
 * dropped when a pasted_text answer has no substantive pasted text left, else unchanged.
 */
export function declarationAfter(
  stored: Declaration | null,
  after: Document,
  pastedInserted: boolean,
): Declaration | null {
  if (stored === null || pastedInserted) return null;
  if (stored.subject === "pasted_text" && !holdsSubstantivePasted(after)) return null;
  return stored;
}
