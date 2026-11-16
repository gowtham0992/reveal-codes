import { AUTOSAVE_KEY, readRaw } from "./persist";
import type { AppServices } from "./services";

export const SAVED_DRAFT_FILE = "reveal-codes-saved-draft.txt";
export const SAVED_DRAFT_MIME = "text/plain;charset=utf-8";

/**
 * Hands the stored draft, read now and encoded as UTF-8, to `download`.
 * False when the read threw, nothing is stored, or the download threw. Never
 * changes the stored value.
 */
export function saveDraftCopy(svc: Pick<AppServices, "storage" | "download">): boolean {
  const stored = readRaw(svc.storage, AUTOSAVE_KEY);
  if (!("raw" in stored) || stored.raw === null) return false;
  try {
    svc.download(new TextEncoder().encode(stored.raw), SAVED_DRAFT_FILE, SAVED_DRAFT_MIME);
    return true;
  } catch {
    return false;
  }
}
