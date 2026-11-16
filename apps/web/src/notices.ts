import type { EngineError } from "@reveal-codes/engine";

export const EXPORT_FAILED = "Export failed. Your document is unchanged.";
export const EXPORT_UNSAFE_CHARACTER =
  "This draft holds a character that Word files cannot store, so it was not exported. Paste the text again or remove the character.";
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

/** Shown in the assistant panel, and sent by /api/assistant with status 429, when its request limit is reached. */
export const ASSISTANT_BUSY = "The assistant is busy. Try again in a few minutes.";

/** Sent by /api/verify and /api/opinion with status 429 when an address is over its limit, and shown where a run fails. */
export const CHECKS_BUSY = "Too many checks from this address. Try again in a moment.";

/** Sent by /api/assistant with status 429 when the hourly limit across all addresses is reached. */
export const ASSISTANT_HOURLY = "The assistant has reached its hourly limit. Try again later.";

/** Sent by /api/verify with status 413 when the request carries more than 200 000 characters. */
export const DOCUMENT_TOO_LONG = "This document is too long to check in one request.";

/** Shown in the Issues region while the Draft_Gate is blocked (Requirement 23). */
export const UNREADABLE_DRAFT =
  "A saved draft could not be read, so it was not loaded. It is still stored in this browser. Nothing you type is saved until you choose.";

/** Save a copy could not read the stored draft, or the download threw. */
export const SAVE_COPY_FAILED =
  "The saved draft could not be copied. It is still stored in this browser.";

/** Open print view while the Draft_Gate is blocked. */
export const PRINT_BLOCKED =
  "Choose Save a copy or Start a new document before opening the print view.";
