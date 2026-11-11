import { err, ok } from "@reveal-codes/engine";
import type { Result } from "@reveal-codes/engine";
import type { StorageLike } from "./autosave";
import { readRaw, savedDraftExists } from "./persist";

export const PANE_KEY = "reveal-codes:pane:v1";

export type PanePreference = Readonly<{ version: 1; open: boolean }>;

export function encodePreference(open: boolean): string {
  const value: PanePreference = { version: 1, open };
  return JSON.stringify(value);
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch (e) {
    if (!(e instanceof SyntaxError)) throw e;
    return null;
  }
}

/** The stored open flag, or null (First_Visit) for a missing or invalid value. */
export function decodePreference(raw: string | null): boolean | null {
  if (raw === null) return null;
  const value = parseJson(raw);
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Readonly<Record<string, unknown>>;
  const open = record["open"];
  if (record["version"] !== 1 || typeof open !== "boolean") return null;
  return open;
}

export function readPreference(storage: Pick<Storage, "getItem">): boolean | null {
  const stored = readRaw(storage, PANE_KEY);
  return "raw" in stored ? decodePreference(stored.raw) : null;
}

/** The caller ignores the result and sets no Notice (Req 1.8). */
export function writePreference(
  storage: Pick<Storage, "setItem">,
  open: boolean,
): Result<true, unknown> {
  try {
    storage.setItem(PANE_KEY, encodePreference(open));
    return ok(true);
  } catch (e) {
    return err(e);
  }
}

/** A Valid_Preference wins; otherwise the Pane opens unless a Saved_Draft exists. */
export function initialPaneOpen(storage: StorageLike): boolean {
  const stored = readPreference(storage);
  return stored ?? !savedDraftExists(storage);
}
