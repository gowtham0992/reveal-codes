import type { Declaration, Document } from "@reveal-codes/engine";
import {
  ORDERS,
  applicableDeclaration,
  canExport,
  declarationRequired,
  declarationSubject,
  needsConfidentiality,
  orderById,
  prohibitionNotice,
} from "@reveal-codes/export";
import type {
  OrderContext,
  OrderEntry,
  ProhibitionNotice,
  SubjectOrNone,
} from "@reveal-codes/export";
import { useEffect, useRef, useState } from "react";
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
  /** The Declaration_Subject for this Document and order; "none" asks nothing. */
  subject: SubjectOrNone;
  /** The Applicable_Declaration, or null. */
  applicable: Declaration | null;
  /** A Declaration is asked and none applicable is stored. */
  required: boolean;
  /** The export buttons may be enabled. */
  clear: boolean;
  context: OrderContext | null;
}>;

/** The tick: cleared when no longer needed and when the Declaration changes (not on mount). */
function useTick(
  needsTick: boolean,
  declaration: Declaration | null,
  clearNotice: () => void,
): readonly [boolean, (ticked: boolean) => void] {
  const [tick, setTick] = useState(false);
  useEffect(() => {
    if (!needsTick) setTick(false);
  }, [needsTick]);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setTick(false);
    clearNotice();
    // Only a changed Declaration clears; clearNotice is a fresh closure each render.
  }, [declaration]);
  return [tick, setTick];
}
/**
 * Order state of the Export_Dialog (Requirements 3, 5, 6). The selection is read from the
 * store when the dialog opens; the tick starts false, is never stored, and is cleared when
 * the selection or the Declaration changes or the checkbox is no longer needed.
 */
export function useOrderGate(
  document: Document,
  orderStore: OrderSelectionStore,
  declaration: Declaration | null,
  clearNotice: () => void = noop,
): OrderGate {
  const [selection, setSelection] = useState<OrderSelection>(() => orderStore.get());
  const entry = selection === null ? null : orderById(ORDERS, selection.entryId);
  const needsTick = needsConfidentiality(document, entry, declaration);
  const required = declarationRequired(document, entry, declaration);
  const [tick, setTick] = useTick(needsTick, declaration, clearNotice);
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
    subject: declarationSubject(document, entry),
    applicable: applicableDeclaration(document, entry, declaration),
    required,
    notice: prohibitionNotice(document, entry, declaration),
    clear: canExport(document, entry, declaration) && !required && (!needsTick || ticked),
    context: entry === null ? null : { entry, confidentialityCertified: ticked },
  };
}
