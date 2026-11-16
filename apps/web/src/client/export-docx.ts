import { parseRecord } from "@reveal-codes/engine";
import type { Declaration, Document } from "@reveal-codes/engine";
import {
  buildAppendix,
  buildDocx,
  buildStatement,
  canExport,
  declarationRequired,
  exportFileName,
  needsConfidentiality,
} from "@reveal-codes/export";
import type { OrderContext, Statement } from "@reveal-codes/export";
import { EXPORT_FAILED, exportedNotice } from "../notices";
import type { StoreAction, StoreState } from "../store";

export type ExportDeps = Readonly<{
  now: () => Date;
  download: (bytes: Uint8Array, fileName: string) => void;
  /** The dialog's selected order and tick; null when no order is selected. */
  orderContext: OrderContext | null;
}>;

export type ExportOutcome =
  | Readonly<{ status: "exported"; fileName: string }>
  | Readonly<{ status: "blocked" }>
  | Readonly<{ status: "failed" }>;

type ExportStore = Readonly<{
  getState: () => StoreState;
  dispatch: (action: StoreAction) => unknown;
}>;

const FAILED: ExportOutcome = { status: "failed" };

function fail(store: ExportStore): ExportOutcome {
  store.dispatch({ type: "notice", text: EXPORT_FAILED });
  return FAILED;
}

/** Subject, choice and Tool_Name agree (both absent counts as the same). */
function sameDeclaration(a: Declaration | null, b: Declaration | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.subject !== b.subject || a.choice !== b.choice) return false;
  return a.choice !== "declared_ai" || (b.choice === "declared_ai" && a.toolName === b.toolName);
}
/** The appendix must parse back to the same Document and Declaration before anything is written. */
function appendixParses(document: Document, declaration: Declaration | null): boolean {
  const parsed = parseRecord(buildAppendix(document, declaration).lines.join("\n"));
  return parsed.ok && sameDeclaration(parsed.value.declaration, declaration);
}
/** Packing failure comes back as the thrown value, not as an exception. */
async function pack(document: Document, statement: Statement): Promise<Uint8Array | Error> {
  try {
    return await buildDocx(document, statement);
  } catch (e) {
    return e instanceof Error ? e : new Error("pack failed");
  }
}

function deliver(deps: ExportDeps, bytes: Uint8Array, fileName: string): Error | null {
  try {
    deps.download(bytes, fileName);
    return null;
  } catch (e) {
    return e instanceof Error ? e : new Error("download failed");
  }
}

/** The Gate and the confidentiality tick, checked again at the moment of export. */
function orderBlocks(
  document: Document,
  context: OrderContext | null,
  declaration: Declaration | null,
): boolean {
  const entry = context === null ? null : context.entry;
  if (!canExport(document, entry, declaration)) return true;
  if (declarationRequired(document, entry, declaration)) return true;
  return (
    needsConfidentiality(document, entry, declaration) && context?.confidentialityCertified !== true
  );
}

/**
 * The whole Download flow. Failures are returned as values and shown as a
 * notice; the Document is never changed. Makes no network request.
 */
export async function exportDocx(store: ExportStore, deps: ExportDeps): Promise<ExportOutcome> {
  const { document, runLog, verifiedAt, declaration } = store.getState();
  if (orderBlocks(document, deps.orderContext, declaration)) return { status: "blocked" };
  const now = deps.now();
  const built = buildStatement(document, runLog, { now, verifiedAt }, deps.orderContext, declaration);
  if (!built.ok || !appendixParses(document, built.value.declaration)) return fail(store);
  const bytes = await pack(document, built.value);
  if (bytes instanceof Error) return fail(store);
  const fileName = exportFileName(built.value.caption, now);
  if (deliver(deps, bytes, fileName) !== null) return fail(store);
  store.dispatch({ type: "notice", text: exportedNotice(fileName) });
  return { status: "exported", fileName };
}
