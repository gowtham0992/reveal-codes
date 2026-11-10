// Validation checks 1 to 3 of the court-orders dataset: root shape, version, entry fields and types.
// The output is a raw entry: vocabulary fields are still plain strings (see orders-check.ts).
import { err, ok } from "@reveal-codes/engine";
import type { Result } from "@reveal-codes/engine";
import type { OrderCourt, OrderJudge } from "./orders-types.js";

export type RawCaption = Readonly<{ placement: string; text: string }>;

export type RawEntry = Readonly<{
  id: string;
  court: OrderCourt;
  judge: OrderJudge | null;
  instrument: string;
  title: string;
  date: string;
  date_note?: string;
  kind: string;
  applies_to: string;
  elements: readonly string[];
  caption: RawCaption | null;
  key_language: string;
  source_url: string;
  source_kind: string;
  retrieved: string;
  status: string;
  supersedes?: string;
  superseded_by?: string;
  notes?: string;
}>;

export type RawOrders = Readonly<{ entries: readonly RawEntry[]; vocabulary: unknown }>;

export type Rec = Readonly<Record<string, unknown>>;

export function isRec(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type Req = Pick<
  RawEntry,
  | "id"
  | "instrument"
  | "title"
  | "date"
  | "kind"
  | "applies_to"
  | "key_language"
  | "source_url"
  | "source_kind"
  | "retrieved"
  | "status"
>;
type Opt = Pick<RawEntry, "date_note" | "supersedes" | "superseded_by" | "notes">;

const REQUIRED_KEYS = [
  "id",
  "instrument",
  "title",
  "date",
  "kind",
  "applies_to",
  "key_language",
  "source_url",
  "source_kind",
  "retrieved",
  "status",
] as const;
const OPTIONAL_KEYS = ["date_note", "supersedes", "superseded_by", "notes"] as const;

function malformed(who: string, field: string): Result<never, string> {
  return err(`${who}: "${field}" is missing or malformed`);
}

function str(rec: Rec, key: string): string | null {
  const v = rec[key];
  return typeof v === "string" ? v : null;
}

function required(rec: Rec): Req | string {
  for (const k of REQUIRED_KEYS) if (str(rec, k) === null) return k;
  return {
    id: str(rec, "id") ?? "",
    instrument: str(rec, "instrument") ?? "",
    title: str(rec, "title") ?? "",
    date: str(rec, "date") ?? "",
    kind: str(rec, "kind") ?? "",
    applies_to: str(rec, "applies_to") ?? "",
    key_language: str(rec, "key_language") ?? "",
    source_url: str(rec, "source_url") ?? "",
    source_kind: str(rec, "source_kind") ?? "",
    retrieved: str(rec, "retrieved") ?? "",
    status: str(rec, "status") ?? "",
  };
}

function optionals(rec: Rec): Opt | string {
  const out: { -readonly [K in keyof Opt]: Opt[K] } = {};
  for (const field of OPTIONAL_KEYS) {
    const v = rec[field];
    if (v === undefined) continue;
    if (typeof v !== "string") return field;
    out[field] = v;
  }
  return out;
}

function readCourt(value: unknown): OrderCourt | null {
  if (!isRec(value)) return null;
  const name = str(value, "name");
  const abbreviation = str(value, "abbreviation");
  const level = str(value, "level");
  if (name === null || abbreviation === null || level === null) return null;
  return { name, abbreviation, level };
}

function readJudge(value: unknown): OrderJudge | null | undefined {
  if (value === null) return null;
  if (!isRec(value)) return undefined;
  const name = str(value, "name");
  const role = str(value, "role");
  return name !== null && role !== null ? { name, role } : undefined;
}

function readCaption(value: unknown): RawCaption | null | undefined {
  if (value === null) return null;
  if (!isRec(value)) return undefined;
  const placement = str(value, "placement");
  const text = str(value, "text");
  return placement !== null && text !== null ? { placement, text } : undefined;
}

function readStrings(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const item of value as readonly unknown[]) {
    if (typeof item !== "string") return null;
    out.push(item);
  }
  return out;
}

export function parseEntry(value: unknown, index: number): Result<RawEntry, string> {
  const id = isRec(value) ? str(value, "id") : null;
  const who = id !== null ? `entry ${id}` : `entry ${String(index)}`;
  if (!isRec(value)) return err(`${who}: entry is not an object`);
  const req = required(value);
  if (typeof req === "string") return malformed(who, req);
  const opt = optionals(value);
  if (typeof opt === "string") return malformed(who, opt);
  const court = readCourt(value["court"]);
  if (court === null) return malformed(who, "court.name");
  const judge = readJudge(value["judge"]);
  if (judge === undefined) return malformed(who, "judge");
  const elements = readStrings(value["elements"]);
  if (elements === null) return malformed(who, "elements");
  const caption = readCaption(value["caption"]);
  if (caption === undefined) return malformed(who, "caption");
  return ok({ ...req, ...opt, court, judge, caption, elements });
}

export function parseRoot(value: unknown): Result<RawOrders, string> {
  if (!isRec(value)) return err("orders: root must be an object");
  if (value["version"] === undefined) return err('orders: "version" is missing');
  if (!Array.isArray(value["entries"])) return err('orders: "entries" must be an array');
  if (value["version"] !== 1) return err('orders: "version" must be 1');
  const entries: RawEntry[] = [];
  for (const [index, item] of (value["entries"] as readonly unknown[]).entries()) {
    const parsed = parseEntry(item, index);
    if (!parsed.ok) return parsed;
    entries.push(parsed.value);
  }
  return ok({ entries, vocabulary: value["vocabulary"] });
}
