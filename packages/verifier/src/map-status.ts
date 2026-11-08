import { err, ok } from "@reveal-codes/engine";
import type { Result, VerificationResult } from "@reveal-codes/engine";
import { asArray, isRecord } from "./json";
import { parseWaitUntil, retryAfterIso } from "./time";

export type ShapeError = Readonly<{ kind: "shape" }>;

export type LineEntry = Readonly<{
  /** `null`: malformed entry. */
  status: number | null;
  /** Distinct, in response order. */
  clusterIds: readonly string[];
  /** ISO, from the entry's `wait_until` or `wait_util`. */
  waitUntil?: string;
}>;

const UNCHECKED: VerificationResult = { status: "unchecked" };

function clusterId(v: unknown): string | null {
  if (typeof v === "number") return Number.isSafeInteger(v) && v > 0 ? String(v) : null;
  return typeof v === "string" && /^[1-9][0-9]*$/.test(v) ? v : null;
}

function clusterIds(clusters: unknown): readonly string[] {
  const out: string[] = [];
  for (const c of asArray(clusters) ?? []) {
    const id = isRecord(c) ? clusterId(c["id"]) : null;
    if (id !== null && !out.includes(id)) out.push(id);
  }
  return out;
}

function parseEntry(raw: unknown): LineEntry {
  if (!isRecord(raw)) return { status: null, clusterIds: [] };
  const s = raw["status"];
  const status = typeof s === "number" && Number.isSafeInteger(s) ? s : null;
  const waitUntil = parseWaitUntil(raw["wait_until"] ?? raw["wait_util"]);
  const base = { status, clusterIds: clusterIds(raw["clusters"]) };
  return waitUntil === null ? base : { ...base, waitUntil };
}

/** The lookup response as entries in response order; a non-array body is a `ShapeError`. */
export function parseLookupBody(body: unknown): Result<readonly LineEntry[], ShapeError> {
  const arr = asArray(body);
  return arr === null ? err({ kind: "shape" }) : ok(arr.map(parseEntry));
}

/** One row of the A5 table. Only status 200 with exactly one cluster id gives `verified`. */
export function mapEntry(
  entry: LineEntry,
  responseRetryAfter: string | null,
  nowMillis: number,
): VerificationResult {
  const ids = entry.clusterIds;
  switch (entry.status) {
    case 200:
      if (ids.length === 1 && ids[0] !== undefined)
        return { status: "verified", clusterId: ids[0] };
      return ids.length >= 2 ? { status: "ambiguous", candidates: ids } : UNCHECKED;
    case 300:
      return ids.length >= 2 ? { status: "ambiguous", candidates: ids } : UNCHECKED;
    case 404:
      return { status: "not_found" };
    case 400:
      return { status: "not_found", reason: "unknown_reporter" };
    case 429: {
      const w = entry.waitUntil ?? retryAfterIso(responseRetryAfter, nowMillis);
      return w === null ? UNCHECKED : { status: "unchecked", waitUntil: w };
    }
    default:
      return UNCHECKED;
  }
}

/**
 * Entry `i` maps to line `i`. A parse error or a count mismatch makes every
 * line `unchecked` with no `waitUntil` (Req 2.6, 2.7).
 */
export function mapChunk(
  lines: readonly string[],
  parsed: Result<readonly LineEntry[], ShapeError>,
  responseRetryAfter: string | null,
  nowMillis: number,
): ReadonlyMap<string, VerificationResult> {
  const out = new Map<string, VerificationResult>();
  const entries = parsed.ok && parsed.value.length === lines.length ? parsed.value : null;
  lines.forEach((line, i) => {
    const entry = entries?.[i];
    out.set(line, entry === undefined ? UNCHECKED : mapEntry(entry, responseRetryAfter, nowMillis));
  });
  return out;
}
