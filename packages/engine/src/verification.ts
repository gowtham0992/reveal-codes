/**
 * Verification and quote-check state (design A10, Req 12.4, 12.5, 13.3,
 * 13.4, 16, 17). Writers return `Result` values; nothing here throws, and a
 * rejected write returns an error without building a new Document.
 */
import type { EngineError } from "./errors.js";
import { structuralEqual } from "./equal.js";
import { err, ok, type Result } from "./result.js";
import type {
  CitationRecord,
  Document,
  IssueKey,
  QuoteCheckResult,
  QuoteRecord,
  VerificationResult,
} from "./types.js";
import { isTimestamp } from "./validate.js";

type FullRecord = Extract<CitationRecord, { kind: "full" }>;
type KeyedRecord = Extract<CitationRecord, { kind: "full" | "short" }>;

const hasOwn = (o: object, key: string): boolean => Object.prototype.hasOwnProperty.call(o, key);

const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v !== "";

function findKeyed(doc: Document, key: IssueKey): KeyedRecord | null {
  for (const r of doc.citations) {
    if (r.kind !== "other" && r.key === key) return r;
  }
  return null;
}

function fullAt(doc: Document, start: number): FullRecord | null {
  for (const r of doc.citations) {
    if (r.kind === "full" && r.citation.start === start) return r;
  }
  return null;
}

function isUnlistedLexis(r: KeyedRecord): boolean {
  if (r.kind !== "full") return false;
  const v = r.citation.value;
  return v.kind === "database" && v.lexisCourtListed === false;
}

function isDistinctIds(ids: readonly unknown[]): boolean {
  return ids.every(isNonEmptyString) && new Set(ids).size === ids.length;
}

/**
 * Payload form of Req 16.2. Returns the name of the first failing field, or
 * null. Reads the value as `unknown` because callers may pass malformed data.
 */
function badVerificationField(r: VerificationResult): string | null {
  const v: { readonly [k: string]: unknown } = r;
  switch (v["status"]) {
    case "verified":
      return isNonEmptyString(v["clusterId"]) ? null : "clusterId";
    case "ambiguous": {
      const c = v["candidates"];
      return Array.isArray(c) && c.length >= 2 && isDistinctIds(c) ? null : "candidates";
    }
    case "not_found":
      return !hasOwn(v, "reason") || isNonEmptyString(v["reason"]) ? null : "reason";
    case "unchecked":
      return !hasOwn(v, "waitUntil") || isTimestamp(v["waitUntil"]) ? null : "waitUntil";
    default:
      return "status";
  }
}

/**
 * Writes a Verification_Result onto a Full_Citation (Req 16). Checks
 * `unknown_citation`, then `not_verifiable`, then `invalid_verification_result`.
 * The Override is kept when the status is unchanged and dropped otherwise.
 */
export function setVerification(
  doc: Document,
  key: IssueKey,
  result: VerificationResult,
): Result<Document, EngineError> {
  const rec = findKeyed(doc, key);
  if (rec === null) return err({ kind: "unknown_citation", key });
  if (rec.kind === "short" || (result.status === "verified" && isUnlistedLexis(rec))) {
    return err({ kind: "not_verifiable", key });
  }
  const field = badVerificationField(result);
  if (field !== null) return err({ kind: "invalid_verification_result", field });
  const statusChanged = rec.result.status !== result.status;
  const citations = doc.citations.map((c) => (c === rec ? { ...rec, result } : c));
  const overrides = statusChanged ? doc.overrides.filter((o) => o.key !== key) : doc.overrides;
  return ok({ ...doc, citations, overrides });
}

function isValidPrefix(p: unknown, quote: QuoteRecord["quote"]): boolean {
  return typeof p === "number" && Number.isInteger(p) && p >= 0 && p < quote.end - quote.start;
}

/** True when the quote's attached citation is an Orphan Short_Form (Req 13.4, 17.8). */
function isOnOrphan(doc: Document, q: QuoteRecord): boolean {
  const attached = doc.citations.find((c) => c.citation.start === q.quote.citationStart);
  if (attached === undefined || attached.kind !== "short") return false;
  const value = attached.citation.value;
  return value.kind === "short" && value.targetStart === null;
}

/**
 * Writes a Quote_Check_Result onto a Quote_Candidate (Req 17). Checks
 * `unknown_quote`, then `not_verifiable`, then `invalid_quote_result`. The
 * Override is dropped when the result differs from the old one.
 */
export function setQuoteCheck(
  doc: Document,
  key: IssueKey,
  result: QuoteCheckResult,
): Result<Document, EngineError> {
  const rec = doc.quotes.find((q) => q.key === key);
  if (rec === undefined) return err({ kind: "unknown_quote", key });
  if (isOnOrphan(doc, rec)) return err({ kind: "not_verifiable", key });
  if (result.status === "mismatch" && !isValidPrefix(result.prefixLength, rec.quote)) {
    return err({ kind: "invalid_quote_result", field: "prefixLength", value: result.prefixLength });
  }
  const changed = !structuralEqual(rec.result, result);
  const quotes = doc.quotes.map((q) => (q === rec ? { ...rec, result } : q));
  const overrides = changed ? doc.overrides.filter((o) => o.key !== key) : doc.overrides;
  return ok({ ...doc, quotes, overrides });
}

const UNCHECKED: VerificationResult = { status: "unchecked" };

/**
 * The Verification_Result of a keyed citation (Req 12.4, 12.5). A Short_Form
 * reports its target's result, and an Orphan reports `unchecked`. Returns
 * null when `key` identifies no Full_Citation or Short_Form.
 */
export function verificationOf(doc: Document, key: IssueKey): VerificationResult | null {
  const rec = findKeyed(doc, key);
  if (rec === null) return null;
  if (rec.kind === "full") return rec.result;
  const value = rec.citation.value;
  if (value.kind !== "short" || value.targetStart === null) return UNCHECKED;
  const target = fullAt(doc, value.targetStart);
  return target === null ? UNCHECKED : target.result;
}
