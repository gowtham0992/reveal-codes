import { parse } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import {
  buildAppendix,
  buildDocx,
  buildStatement,
  canExport,
  exportFileName,
} from "@reveal-codes/export";
import type { Statement } from "@reveal-codes/export";
import { EXPORT_FAILED, exportedNotice } from "../notices";
import type { StoreAction, StoreState } from "../store";

export type ExportDeps = Readonly<{
  now: () => Date;
  download: (bytes: Uint8Array, fileName: string) => void;
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

/** The appendix must parse back to the same codes before anything is written. */
function appendixParses(document: Document): boolean {
  return parse(buildAppendix(document).lines.join("\n")).ok;
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

/**
 * The whole Download flow. Failures are returned as values and shown as a
 * notice; the Document is never changed. Makes no network request.
 */
export async function exportDocx(store: ExportStore, deps: ExportDeps): Promise<ExportOutcome> {
  const { document, runLog, verifiedAt } = store.getState();
  if (!canExport(document, null)) return { status: "blocked" };
  const now = deps.now();
  const built = buildStatement(document, runLog, { now, verifiedAt });
  if (!built.ok || !appendixParses(document)) return fail(store);
  const bytes = await pack(document, built.value);
  if (bytes instanceof Error) return fail(store);
  const fileName = exportFileName(built.value.caption, now);
  if (deliver(deps, bytes, fileName) !== null) return fail(store);
  store.dispatch({ type: "notice", text: exportedNotice(fileName) });
  return { status: "exported", fileName };
}
