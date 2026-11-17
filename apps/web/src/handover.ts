import type { StorageLike } from "./autosave";

export const HANDOVER_KEY = "reveal-codes:check-handover:v1";

/** A storage call's outcome as a value: its result, or the error it threw. */
type Attempt<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly thrown: unknown };

function attempt<T>(action: () => T): Attempt<T> {
  try {
    return { ok: true, value: action() };
  } catch (e) {
    return { ok: false, thrown: e };
  }
}

/** Writes the draft text for the editor. Returns false when the write throws (storage disabled or full). */
export function writeHandover(session: StorageLike, text: string): boolean {
  return attempt(() => {
    session.setItem(HANDOVER_KEY, text);
  }).ok;
}

/** Reads the hand-over and removes the key in the same step. Null when missing, empty or unreadable. */
export function takeHandover(session: StorageLike): string | null {
  const read = attempt(() => session.getItem(HANDOVER_KEY));
  // The text is already read; a failed remove does not change the result.
  attempt(() => {
    session.removeItem(HANDOVER_KEY);
  });
  if (!read.ok || read.value === null || read.value === "") return null;
  return read.value;
}
