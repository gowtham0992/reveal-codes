// Validation checks 4 to 9 of the court-orders dataset (see design D1 to D6). Check 4 narrows
// vocabulary strings to the code's unions; checks 5 to 9 read typed entries. Each check scans all
// entries in file order and returns the first failure.
import { err, ok } from "@reveal-codes/engine";
import type { Result } from "@reveal-codes/engine";
import { isRec } from "./orders-parse.js";
import type { RawEntry } from "./orders-parse.js";
import {
  APPLIES_TO,
  CAPTION_PLACEMENTS,
  ORDER_ELEMENTS,
  ORDER_KINDS,
  ORDER_STATUSES,
} from "./orders-types.js";
import type { OrderCaption, OrderEntry } from "./orders-types.js";

function member<T extends string>(list: readonly T[], value: string): value is T {
  return list.some((item) => item === value);
}

function hasKeys(vocabulary: unknown): vocabulary is Readonly<Record<string, unknown>> {
  if (!isRec(vocabulary)) return false;
  return ["kind", "applies_to", "elements", "caption.placement", "status"].every((k) =>
    isRec(vocabulary[k]),
  );
}

function inFile(
  vocabulary: Readonly<Record<string, unknown>>,
  group: string,
  word: string,
): boolean {
  const words = vocabulary[group];
  return isRec(words) && Object.prototype.hasOwnProperty.call(words, word);
}

function unknownValue(id: string, field: string, value: string): Result<never, string> {
  return err(`entry ${id}: "${field}" has unknown value "${value}"`);
}

function narrowCaption(
  raw: RawEntry,
  vocabulary: Readonly<Record<string, unknown>>,
): Result<OrderCaption | null, string> {
  if (raw.caption === null) return ok(null);
  const { placement, text } = raw.caption;
  if (
    !member(CAPTION_PLACEMENTS, placement) ||
    !inFile(vocabulary, "caption.placement", placement)
  ) {
    return unknownValue(raw.id, "caption.placement", placement);
  }
  return ok({ placement, text });
}

function narrowElements(
  raw: RawEntry,
  vocabulary: Readonly<Record<string, unknown>>,
): Result<readonly OrderEntry["elements"][number][], string> {
  const out: OrderEntry["elements"][number][] = [];
  for (const word of raw.elements) {
    if (!member(ORDER_ELEMENTS, word) || !inFile(vocabulary, "elements", word)) {
      return unknownValue(raw.id, "elements", word);
    }
    out.push(word);
  }
  return ok(out);
}

function narrowEntry(
  raw: RawEntry,
  vocabulary: Readonly<Record<string, unknown>>,
): Result<OrderEntry, string> {
  const { kind, applies_to: appliesTo, status } = raw;
  if (!member(ORDER_KINDS, kind) || !inFile(vocabulary, "kind", kind)) {
    return unknownValue(raw.id, "kind", kind);
  }
  if (!member(APPLIES_TO, appliesTo) || !inFile(vocabulary, "applies_to", appliesTo)) {
    return unknownValue(raw.id, "applies_to", appliesTo);
  }
  const elements = narrowElements(raw, vocabulary);
  if (!elements.ok) return elements;
  const caption = narrowCaption(raw, vocabulary);
  if (!caption.ok) return caption;
  if (!member(ORDER_STATUSES, status) || !inFile(vocabulary, "status", status)) {
    return unknownValue(raw.id, "status", status);
  }
  return ok({
    ...raw,
    kind,
    applies_to: appliesTo,
    status,
    elements: elements.value,
    caption: caption.value,
  });
}

/** Check 4: vocabulary membership. Turns raw strings into the typed unions. */
export function checkVocabulary(
  raws: readonly RawEntry[],
  vocabulary: unknown,
): Result<readonly OrderEntry[], string> {
  if (!hasKeys(vocabulary)) return err('orders: "vocabulary" is missing or malformed');
  const out: OrderEntry[] = [];
  for (const raw of raws) {
    const entry = narrowEntry(raw, vocabulary);
    if (!entry.ok) return entry;
    out.push(entry.value);
  }
  return ok(out);
}

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Check 5: kebab-case ids, no duplicates. */
export function checkIds(entries: readonly OrderEntry[]): string | null {
  const seen = new Set<string>();
  for (const { id } of entries) {
    if (!KEBAB.test(id)) return `entry ${id}: "id" is not kebab-case`;
    if (seen.has(id)) return `entry ${id}: "id" is duplicated`;
    seen.add(id);
  }
  return null;
}

/** Check 6: supersedes and superseded_by name an entry in the same file. */
export function checkReferences(entries: readonly OrderEntry[]): string | null {
  const ids = new Set(entries.map((e) => e.id));
  for (const e of entries) {
    if (e.supersedes !== undefined && !ids.has(e.supersedes)) {
      return `entry ${e.id}: "supersedes" names no entry`;
    }
    if (e.superseded_by !== undefined && !ids.has(e.superseded_by)) {
      return `entry ${e.id}: "superseded_by" names no entry`;
    }
  }
  return null;
}

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** True for a real calendar date written YYYY-MM-DD (Gregorian; no Date object, D6). */
export function isCalendarDate(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return false;
  const length = (MONTH_DAYS[month - 1] ?? 0) + (month === 2 && isLeap(year) ? 1 : 0);
  return day >= 1 && day <= length;
}

/** Check 7: dates. */
export function checkDates(entries: readonly OrderEntry[]): string | null {
  const bad = entries.find((e) => !isCalendarDate(e.date));
  return bad === undefined ? null : `entry ${bad.id}: "date" is not a calendar date`;
}

/** The lower-cased host of an https URL, or null (D5). Hand-written: no URL global in this package. */
export function hostOf(url: string): string | null {
  const prefix = "https://";
  if (!url.startsWith(prefix)) return null;
  const rest = url.slice(prefix.length);
  const stop = rest.search(/[/?#]/);
  const host = stop === -1 ? rest : rest.slice(0, stop);
  if (host === "" || /[@:\\\s]/.test(host)) return null;
  return host.toLowerCase();
}

function allowedHost(host: string): boolean {
  return host.endsWith(".uscourts.gov") || host === "edrm.net";
}

/** Check 8: source_url. */
export function checkUrls(entries: readonly OrderEntry[]): string | null {
  for (const e of entries) {
    const host = hostOf(e.source_url);
    if (host === null || !allowedHost(host))
      return `entry ${e.id}: "source_url" is not an allowed https URL`;
  }
  return null;
}

/** Check 9: key_language is 1 to 400 characters. */
export function checkKeyLanguage(entries: readonly OrderEntry[]): string | null {
  const bad = entries.find((e) => e.key_language.length < 1 || e.key_language.length > 400);
  return bad === undefined ? null : `entry ${bad.id}: "key_language" must be 1 to 400 characters`;
}
