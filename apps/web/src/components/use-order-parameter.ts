"use client";

import { orderById } from "@reveal-codes/export";
import type { OrderEntry, OrderSet } from "@reveal-codes/export";
import { useEffect } from "react";
import { optionText } from "../order-copy";
import type { OrderSelectionStore } from "../order-selection";
import { NARROW_WIDTH } from "../services";
import type { AppServices } from "../services";

export const ORDER_PARAMETER = "order";

export type OrderParameterResult = Readonly<
  { kind: "none" } | { kind: "ignored" } | { kind: "applied"; entry: OrderEntry }
>;

/** Pure: classify the raw parameter value against the dataset. */
export function classifyOrderParameter(orders: OrderSet, raw: string | null): OrderParameterResult {
  if (raw === null) return { kind: "none" };
  const entry = orderById(orders, raw);
  return entry === null ? { kind: "ignored" } : { kind: "applied", entry };
}

/** The Toolbar_Notice text for an applied instrument. */
export function orderNoticeText(entry: OrderEntry): string {
  return `Court rule selected: ${entry.court.abbreviation}, ${optionText(entry)}.`;
}

/** The address without the Order_Parameter; other parameters and the hash stay. */
function addressWithoutOrder(location: Location): string {
  const params = new URLSearchParams(location.search);
  params.delete(ORDER_PARAMETER);
  const query = params.toString();
  return `${location.pathname}${query === "" ? "" : `?${query}`}${location.hash}`;
}

/** Replaces the current history entry. Only a DOMException (a refused URL change) is caught. */
function removeParameter(): void {
  try {
    window.history.replaceState(window.history.state, "", addressWithoutOrder(window.location));
  } catch (e) {
    if (!(e instanceof DOMException)) throw e;
  }
}

export type OrderApplied = (entry: OrderEntry, notify: boolean) => void;

/**
 * Runs once after mount: reads the parameter, stores a Selectable_Instrument, removes the
 * parameter. `notify` is true when the Shell is on screen (800px and wider).
 */
export function useOrderParameter(
  svc: Pick<AppServices, "viewport">,
  orderStore: OrderSelectionStore,
  orders: OrderSet,
  onApplied: OrderApplied,
): void {
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get(ORDER_PARAMETER);
    const result = classifyOrderParameter(orders, raw);
    if (result.kind === "none") return;
    if (result.kind === "applied") {
      orderStore.set({ entryId: result.entry.id });
      onApplied(result.entry, svc.viewport.width() >= NARROW_WIDTH);
    }
    removeParameter();
  }, []); // once after mount only
}
