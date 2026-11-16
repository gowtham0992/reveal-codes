// Restore helpers (open-draft task 2.5). Test support only.
// One path for Properties 2, 3 and 4 and the restore examples: export a Document, reopen the bytes with
// readWordDraft, and compare with structuralEqual.
// The Engine index does not export structuralEqual and the Engine is not edited; import the module directly.
import { structuralEqual } from "../../../engine/src/equal.js";
import type { Declaration, Document } from "@reveal-codes/engine";
import { buildDocx, buildStatement, readWordDraft } from "../../src/index.js";
import type { OrderContext, RunInfo, WordDraft } from "../../src/index.js";

export const RESTORE_LIMITS = { maxPartBytes: 33_554_432 } as const;
export const RESTORE_NOW = new Date("2026-11-20T18:30:00.000Z");
export const RESTORE_VERIFIED_AT = "2026-11-20T18:25:00.000Z";

export type ExportOptions = Readonly<{
  runLog?: readonly RunInfo[];
  now?: Date;
  verifiedAt?: string | null;
  orderContext?: OrderContext;
  declaration?: Declaration | null;
}>;

/** Builds the statement and the DOCX bytes for `document`. Throws if the statement is refused (test support). */
export async function exportBytes(
  document: Document,
  options: ExportOptions = {},
): Promise<Uint8Array> {
  const meta = {
    now: options.now ?? RESTORE_NOW,
    verifiedAt: options.verifiedAt === undefined ? RESTORE_VERIFIED_AT : options.verifiedAt,
  };
  const built = buildStatement(
    document,
    options.runLog ?? [],
    meta,
    options.orderContext ?? null,
    options.declaration ?? null,
  );
  if (!built.ok) throw new Error(`restore helper: statement refused (${built.error.kind})`);
  return buildDocx(document, built.value);
}

export function reopen(bytes: Uint8Array): WordDraft {
  return readWordDraft(bytes, RESTORE_LIMITS);
}

export type Restored = Readonly<{
  draft: WordDraft;
  /** True when the draft is `restored` and its Document is structurally equal to the exported one. */
  documentEqual: boolean;
  /** True when the draft is `restored` and its Declaration equals the one exported (null equals null). */
  declarationEqual: boolean;
}>;

/** Compares a reopened draft with the Document and Declaration that were exported. */
export function compareRestored(
  draft: WordDraft,
  document: Document,
  declaration: Declaration | null = null,
): Restored {
  if (draft.kind !== "restored") {
    return { draft, documentEqual: false, declarationEqual: false };
  }
  return {
    draft,
    documentEqual: structuralEqual(draft.record.document, document),
    declarationEqual: structuralEqual(draft.record.declaration, declaration),
  };
}

/** Export `document`, reopen the bytes and compare. The shared path of the restore properties. */
export async function exportAndRestore(
  document: Document,
  options: ExportOptions = {},
): Promise<Restored> {
  const bytes = await exportBytes(document, options);
  return compareRestored(reopen(bytes), document, options.declaration ?? null);
}
