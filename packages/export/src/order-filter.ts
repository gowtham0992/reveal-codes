import type { OrderEntry, OrderKind } from "./orders-types.js";

export type KindChoice = OrderKind | "all";
export type FilterState = Readonly<{ query: string; kind: KindChoice; showInactive: boolean }>;
export const CLEARED_FILTER: FilterState = { query: "", kind: "all", showInactive: false };

/** Lower-case, then drop every character that is not a letter or a digit (Unicode). */
export function normaliseText(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function matchesQuery(entry: OrderEntry, needle: string): boolean {
  if (needle === "") return true;
  const fields = [entry.court.name, entry.court.abbreviation];
  if (entry.judge !== null) fields.push(entry.judge.name);
  return fields.some((field) => normaliseText(field).includes(needle));
}

/** R6.4. Input order is preserved. */
export function filterOrders(
  entries: readonly OrderEntry[],
  state: FilterState,
): readonly OrderEntry[] {
  const needle = normaliseText(state.query);
  return entries.filter(
    (entry) =>
      (entry.status === "current" || state.showInactive) &&
      (state.kind === "all" || state.kind === entry.kind) &&
      matchesQuery(entry, needle),
  );
}
