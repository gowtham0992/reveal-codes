import type { EngineError } from "@reveal-codes/engine";

export const EXPORT_FAILED = "Export failed. Your document is unchanged.";
export const PRINT_FAILED = "The print view did not open.";

/** Notice after a successful download. */
export function exportedNotice(fileName: string): string {
  return `Exported ${fileName}.`;
}

export type HistoryDirection = "undo" | "redo";

/** Notice for an edit the Engine rejected (Error Handling table, row 1). */
export function noticeForError(error: EngineError): string {
  return `Edit not applied: ${error.kind}.`;
}

/** Notice for an undo or redo the Engine rejected (Requirement 8.8). */
export function noticeForHistoryError(error: EngineError, direction: HistoryDirection): string {
  const label = direction === "undo" ? "Undo" : "Redo";
  if (error.kind === "stale_inverse") {
    return `${label} not applied: the document changed since this edit.`;
  }
  return `${label} not applied: ${error.kind}.`;
}
