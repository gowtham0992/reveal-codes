import { orderById } from "@reveal-codes/export";
import type { OrderSet } from "@reveal-codes/export";
import type { StorageLike } from "./autosave";

export const ORDER_KEY = "reveal-codes:order:v1";

export type OrderSelection = Readonly<{ entryId: string }> | null;

export type OrderSelectionStore = Readonly<{
  get: () => OrderSelection;
  set: (selection: OrderSelection) => void;
}>;

/** Boundary for `localStorage`, which throws on quota or private mode: the throw becomes a value. */
function attempt<T>(action: () => T): { ok: true; value: T } | { ok: false; thrown: unknown } {
  try {
    return { ok: true, value: action() };
  } catch (e) {
    return { ok: false, thrown: e };
  }
}

function parseStored(text: string | null): string | null {
  if (text === null) return null;
  const parsed = attempt((): unknown => JSON.parse(text));
  if (!parsed.ok) return null;
  const value = parsed.value;
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record["version"] !== 1) return null;
  const entryId = record["entryId"];
  return typeof entryId === "string" ? entryId : null;
}

/** Returns the stored selection only when it names a selectable (current) entry. */
export function readOrderSelection(storage: StorageLike, orders: OrderSet): OrderSelection {
  const read = attempt(() => storage.getItem(ORDER_KEY));
  if (!read.ok) return null;
  const entryId = parseStored(read.value);
  if (entryId === null) return null;
  return orderById(orders, entryId) === null ? null : { entryId };
}

/** Writes or removes the key. False when storage threw. */
export function writeOrderSelection(storage: StorageLike, selection: OrderSelection): boolean {
  const written = attempt(() => {
    if (selection === null) storage.removeItem(ORDER_KEY);
    else storage.setItem(ORDER_KEY, JSON.stringify({ version: 1, entryId: selection.entryId }));
  });
  return written.ok;
}

/** localStorage is authoritative; memory holds a value only after a failed write (D16). */
export function createOrderSelectionStore(
  storage: StorageLike,
  orders: OrderSet,
): OrderSelectionStore {
  let memory: OrderSelection | undefined;
  return {
    get() {
      return memory !== undefined ? memory : readOrderSelection(storage, orders);
    },
    set(selection) {
      memory = writeOrderSelection(storage, selection) ? undefined : selection;
    },
  };
}
