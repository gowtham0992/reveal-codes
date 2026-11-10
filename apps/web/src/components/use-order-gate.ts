import type { Document } from "@reveal-codes/engine";
import {
  ORDERS,
  canExport,
  needsConfidentiality,
  orderById,
  prohibitionNotice,
} from "@reveal-codes/export";
import type { OrderContext, OrderEntry, ProhibitionNotice } from "@reveal-codes/export";
import { useEffect, useState } from "react";
import type { OrderSelection, OrderSelectionStore } from "../order-selection";

const noop = (): void => undefined;

export type OrderGate = Readonly<{
  selection: OrderSelection;
  entry: OrderEntry | null;
  select: (selection: OrderSelection) => void;
  needsTick: boolean;
  ticked: boolean;
  setTicked: (ticked: boolean) => void;
  notice: ProhibitionNotice | null;
  /** The export buttons may be enabled. */
  clear: boolean;
  context: OrderContext | null;
}>;

/**
 * Order state of the Export_Dialog (Requirements 3, 5, 6). The selection is read from the
 * store when the dialog opens; the tick starts false, is never stored, and is cleared when
 * the selection changes or the checkbox is no longer needed.
 */
export function useOrderGate(
  document: Document,
  orderStore: OrderSelectionStore,
  clearNotice: () => void = noop,
): OrderGate {
  const [selection, setSelection] = useState<OrderSelection>(() => orderStore.get());
  const [tick, setTick] = useState(false);
  const entry = selection === null ? null : orderById(ORDERS, selection.entryId);
  const needsTick = needsConfidentiality(document, entry);
  useEffect(() => {
    if (!needsTick) setTick(false);
  }, [needsTick]);
  const ticked = needsTick && tick;
  const select = (next: OrderSelection): void => {
    orderStore.set(next);
    setSelection(next);
    setTick(false);
    clearNotice();
  };
  return {
    selection,
    entry,
    select,
    needsTick,
    ticked,
    setTicked: setTick,
    notice: prohibitionNotice(document, entry),
    clear: canExport(document, entry) && (!needsTick || ticked),
    context: entry === null ? null : { entry, confidentialityCertified: ticked },
  };
}
