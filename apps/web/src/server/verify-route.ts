import { lookupWithInfo } from "@reveal-codes/verifier";
import type { Deps } from "@reveal-codes/verifier";
import type { CitationRecord } from "@reveal-codes/engine";
import { readBodyCapped } from "./body";
import { jsonResponse } from "./http";
import { CHECKS_BUSY, DOCUMENT_TOO_LONG } from "../notices";
import { overRouteLimit } from "./rate-limit";
import type { RouteGuard } from "./rate-limit";

export const MAX_BODY_BYTES = 262_144;
export const MAX_RECORDS = 500;
/** The most code units a record's `caseName` may hold. */
export const MAX_CASE_NAME = 200;
/**
 * The most text, in characters, one request may carry. The body holds the citation records
 * and no draft text, so this bounds the request the route reads, ahead of any lookup. The
 * smaller caps above it still apply: 500 records is about 112 000 characters for typical
 * records, and 262 144 bytes bounds the body whatever its characters.
 */
export const MAX_TEXT_CHARS = 200_000;

export type FullRecord = Extract<CitationRecord, { kind: "full" }>;
export type RouteError = Readonly<{ status: 400 | 413; message: string }>;
export type ParsedBody =
  Readonly<{ ok: true; value: readonly FullRecord[] }> | Readonly<{ ok: false; error: RouteError }>;

const BAD_BODY: RouteError = { status: 400, message: "Request body is not valid." };
const TOO_LARGE: RouteError = { status: 413, message: "Request is too large." };

function fail(error: RouteError): ParsedBody {
  return { ok: false, error };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isMember(value: unknown): boolean {
  return (
    isObject(value) &&
    isCount(value["volume"]) &&
    typeof value["reporter"] === "string" &&
    isCount(value["page"])
  );
}

/** True when the Verifier's `buildLines` can read the value without throwing. */
function isCitationValue(value: unknown): boolean {
  if (!isObject(value)) return false;
  if (value["kind"] === "reporter") return isMember(value);
  if (value["kind"] === "database") return true;
  if (value["kind"] !== "parallel") return false;
  const members = value["members"];
  return Array.isArray(members) && members.every(isMember);
}

function isFullRecord(value: unknown): value is FullRecord {
  if (!isObject(value) || value["kind"] !== "full") return false;
  if (typeof value["key"] !== "string") return false;
  const citation = value["citation"];
  if (!isObject(citation) || !isCitationValue(citation["value"])) return false;
  const name = citation["caseName"];
  return name === undefined || (typeof name === "string" && name.length <= MAX_CASE_NAME);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    return error;
  }
}

/** Order: JSON, shape, count (413), then each record (400). Messages are fixed and never echo input. */
export function parseVerifyBody(text: string): ParsedBody {
  const body = parseJson(text);
  if (body instanceof Error || !isObject(body)) return fail(BAD_BODY);
  const keys = Object.keys(body);
  const records = body["records"];
  if (keys.length !== 1 || keys[0] !== "records" || !Array.isArray(records)) {
    return fail(BAD_BODY);
  }
  if (records.length > MAX_RECORDS) return fail(TOO_LARGE);
  const valid: FullRecord[] = [];
  for (const record of records as unknown[]) {
    if (!isFullRecord(record)) return fail(BAD_BODY);
    valid.push(record);
  }
  return { ok: true, value: valid };
}

/** Over the limit: 429 before the body is read; `guard` is absent or off in demo mode. */
export async function handleVerify(
  request: Request,
  deps: Deps,
  guard?: RouteGuard,
): Promise<Response> {
  const limited = overRouteLimit(guard, CHECKS_BUSY);
  if (limited !== null) return limited;
  const body = await readBodyCapped(request, MAX_BODY_BYTES);
  if (!body.ok) return jsonResponse(413, { error: TOO_LARGE.message });
  if (body.text.length > MAX_TEXT_CHARS) return jsonResponse(413, { error: DOCUMENT_TOO_LONG });
  const parsed = parseVerifyBody(body.text);
  if (!parsed.ok) return jsonResponse(parsed.error.status, { error: parsed.error.message });
  const { results, info } = await lookupWithInfo(parsed.value, deps);
  return jsonResponse(200, { results: [...results], info: [...info] });
}
