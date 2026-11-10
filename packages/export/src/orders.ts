// The validated, typed view of data/standing-orders.json. Pure functions over plain data.
import { err, ok } from "@reveal-codes/engine";
import type { Result } from "@reveal-codes/engine";
import data from "../../../data/standing-orders.json";
import {
  checkDates,
  checkIds,
  checkKeyLanguage,
  checkReferences,
  checkUrls,
  checkVocabulary,
} from "./orders-check.js";
import { parseRoot } from "./orders-parse.js";
import type { OrderEntry, OrderJudge, OrderSet } from "./orders-types.js";

export type OrderGroup = Readonly<{ court: string; entries: readonly OrderEntry[] }>;

type Check = (entries: readonly OrderEntry[]) => string | null;

const TYPED_CHECKS: readonly Check[] = [
  checkIds,
  checkReferences,
  checkDates,
  checkUrls,
  checkKeyLanguage,
];

/** Validates a dataset value check by check (D1). Never throws. */
export function loadOrders(value: unknown): Result<OrderSet, string> {
  const root = parseRoot(value);
  if (!root.ok) return root;
  const typed = checkVocabulary(root.value.entries, root.value.vocabulary);
  if (!typed.ok) return typed;
  for (const check of TYPED_CHECKS) {
    const message = check(typed.value);
    if (message !== null) return err(message);
  }
  return ok({ version: 1, entries: typed.value });
}

function loadShipped(): OrderSet {
  const loaded = loadOrders(data);
  if (!loaded.ok) throw new Error(`data/standing-orders.json is invalid: ${loaded.error}`);
  return loaded.value;
}

/** Loaded once at module load; throws only if the shipped file fails its own validation (D4). */
export const ORDERS: OrderSet = loadShipped();

/** The last whitespace-separated token of the judge's name. */
export function judgeSurname(judge: OrderJudge): string {
  const tokens = judge.name.trim().split(/\s+/);
  return tokens[tokens.length - 1] ?? "";
}

function rank(entry: OrderEntry): number {
  return entry.judge === null ? 0 : 1;
}

function compareEntries(a: OrderEntry, b: OrderEntry): number {
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  if (a.judge === null || b.judge === null) return 0;
  return judgeSurname(a.judge).localeCompare(judgeSurname(b.judge), "en");
}

/** Current entries grouped by court abbreviation: court-wide first, then judges by surname. */
export function selectableOrders(orders: OrderSet): readonly OrderGroup[] {
  const groups = new Map<string, OrderEntry[]>();
  for (const entry of orders.entries) {
    if (entry.status !== "current") continue;
    const key = entry.court.abbreviation;
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [entry]);
    else group.push(entry);
  }
  return [...groups].map(([court, entries]) => ({
    court,
    entries: [...entries].sort(compareEntries),
  }));
}

/** The entry with this id, only when it is current; otherwise null. */
export function orderById(orders: OrderSet, id: string): OrderEntry | null {
  return orders.entries.find((e) => e.id === id && e.status === "current") ?? null;
}

/** The standard title plus each distinct caption text used as a statement title (any status). */
export function statementTitles(orders: OrderSet, standardTitle: string): readonly string[] {
  const titles = [standardTitle];
  for (const { caption } of orders.entries) {
    if (caption === null || caption.placement === "first_page_heading") continue;
    if (!titles.includes(caption.text)) titles.push(caption.text);
  }
  return titles;
}
