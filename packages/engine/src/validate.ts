/**
 * Shared input validation (design A1 step 1, Req 2.5–2.7, 7.3). Pure
 * functions over plain data; no `Date`, no clock.
 */
import type { InvalidProvenance } from "./errors.js";
import { err, ok, type Result } from "./result.js";
import type { Origin, Provenance } from "./types.js";

const TIMESTAMP_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,9})?Z$/;

const ORIGINS: readonly Origin[] = ["HUM", "PST", "AI", "AI>HUM"];

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

/**
 * True iff `value` is an ISO-8601 UTC string of the form
 * `YYYY-MM-DDTHH:MM:SS[.f{1,9}]Z` naming a real calendar instant
 * (Gregorian leap years; seconds 00–59). Req 2.7.
 */
export function isTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = TIMESTAMP_RE.exec(value);
  if (m === null) return false;
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth(year, month)) return false;
  return hour <= 23 && minute <= 59 && second <= 59;
}

function isHigh(unit: number): boolean {
  return unit >= 0xd800 && unit <= 0xdbff;
}

function isLow(unit: number): boolean {
  return unit >= 0xdc00 && unit <= 0xdfff;
}

/**
 * Offset of the first high surrogate not immediately followed by a low
 * surrogate, or low surrogate not immediately preceded by a high one;
 * `null` when `text` has none. Req 2.6, 7.3.
 */
export function firstUnpairedSurrogate(text: string): number | null {
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    if (isHigh(unit)) {
      if (i + 1 < text.length && isLow(text.charCodeAt(i + 1))) {
        i++;
        continue;
      }
      return i;
    }
    if (isLow(unit)) return i;
  }
  return null;
}

/**
 * True iff `offset` is an integer in [0, text.length] that does not fall
 * between the two code units of a Surrogate_Pair (Valid_Boundary, Req 7.3).
 */
export function isValidBoundary(text: string, offset: number): boolean {
  if (!Number.isInteger(offset) || offset < 0 || offset > text.length) return false;
  if (offset === 0 || offset === text.length) return true;
  return !(isHigh(text.charCodeAt(offset - 1)) && isLow(text.charCodeAt(offset)));
}

function isOrigin(value: unknown): value is Origin {
  return ORIGINS.some((o) => o === value);
}

/**
 * Checks the shape of a Provenance_Record (Req 2.5): Origin is one of the
 * four Origins, and a Run_Id is present (as a non-empty string) iff the
 * Origin is `AI` or `AI>HUM`. A key holding `undefined` counts as present.
 * The Timestamp is not checked here; callers check it separately so that
 * `invalid_timestamp` keeps its place in the error order (design A2).
 */
export function checkProvenance(p: Provenance): Result<Provenance, InvalidProvenance> {
  const origin: unknown = p.origin;
  if (!isOrigin(origin)) return err({ kind: "invalid_provenance", field: "origin", value: origin });
  const hasRunId = Object.prototype.hasOwnProperty.call(p, "runId");
  const runId: unknown = p.runId;
  const needsRunId = origin === "AI" || origin === "AI>HUM";
  if (needsRunId && (typeof runId !== "string" || runId === "")) {
    return err({ kind: "invalid_provenance", field: "runId", value: runId });
  }
  if (!needsRunId && hasRunId) {
    return err({ kind: "invalid_provenance", field: "runId", value: runId });
  }
  return ok(p);
}
