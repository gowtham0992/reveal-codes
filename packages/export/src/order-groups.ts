import type { OrderCourt, OrderDataset, OrderEntry } from "./orders-types.js";

export type CourtGroupView = Readonly<{
  court: OrderCourt;
  entries: readonly OrderEntry[];
}>;

export type OrderStats = Readonly<{
  total: number;
  courts: number;
  inForce: number;
  compiled: string;
}>;

function stripSpacesAndStops(text: string): string {
  return text.replace(/[\s.]/g, "");
}

/**
 * Court order: ignores spaces and full stops and is numeric-aware, so
 * "5th Cir." sorts before "10th Cir. BAP" and "D.N.M." falls between
 * "D. Neb." and "D. Wyo.".
 */
export function compareAbbreviations(a: string, b: string): number {
  return stripSpacesAndStops(a).localeCompare(stripSpacesAndStops(b), "en", { numeric: true });
}

function rank(entry: OrderEntry): number {
  return entry.judge === null ? 0 : 1;
}

function compareCodeUnits(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

function compareEntries(a: OrderEntry, b: OrderEntry): number {
  return rank(a) - rank(b) || compareCodeUnits(b.date, a.date) || compareCodeUnits(a.id, b.id);
}

/** Groups by court abbreviation; courts and the instruments inside each are ordered. */
export function courtGroups(entries: readonly OrderEntry[]): readonly CourtGroupView[] {
  const byCourt = new Map<string, { court: OrderCourt; entries: OrderEntry[] }>();
  for (const entry of entries) {
    const found = byCourt.get(entry.court.abbreviation);
    if (found === undefined) {
      byCourt.set(entry.court.abbreviation, { court: entry.court, entries: [entry] });
    } else {
      found.entries.push(entry);
    }
  }
  return [...byCourt.values()]
    .sort((a, b) => compareAbbreviations(a.court.abbreviation, b.court.abbreviation))
    .map((group) => ({ court: group.court, entries: [...group.entries].sort(compareEntries) }));
}

export function orderStats(dataset: OrderDataset): OrderStats {
  return {
    total: dataset.entries.length,
    courts: new Set(dataset.entries.map((entry) => entry.court.abbreviation)).size,
    inForce: dataset.entries.filter((entry) => entry.status === "current").length,
    compiled: dataset.compiled,
  };
}
