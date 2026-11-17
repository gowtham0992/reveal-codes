import type { StorageLike } from "./autosave";

export const HANDOVER_KEY = "reveal-codes:check-handover:v1";

/** Writes the draft text for the editor. Returns false when the write throws. */
export function writeHandover(session: StorageLike, text: string): boolean {
  try {
    session.setItem(HANDOVER_KEY, text);
    return true;
  } catch {
    // Storage disabled or full: the caller reports it. The result is the value.
    return false;
  }
}

function readValue(session: StorageLike): string | null {
  try {
    return session.getItem(HANDOVER_KEY);
  } catch {
    return null;
  }
}

function removeKey(session: StorageLike): void {
  try {
    session.removeItem(HANDOVER_KEY);
  } catch {
    // The text was already read; a failed remove does not change the result.
  }
}

/** Reads the hand-over and removes the key in the same step. Null when missing, empty or unreadable. */
export function takeHandover(session: StorageLike): string | null {
  const value = readValue(session);
  removeKey(session);
  return value === null || value === "" ? null : value;
}
