/**
 * Issues, blocking Issues, and Overrides (design A10, Req 12.5, 13.4, 17.6,
 * 17.7, 18). `issues`, `blockingIssues`, and `overrides` are total.
 * `recordOverride` returns a `Result` and never throws.
 */
import type { EngineError } from "./errors.js";
import { issueOrder } from "./anchor-keys.js";
import { err, ok, type Result } from "./result.js";
import type {
  CitationRecord,
  Document,
  Issue,
  IssueCode,
  IssueKey,
  Override,
  QuoteRecord,
  VerificationResult,
} from "./types.js";
import { isTimestamp } from "./validate.js";

const FULL_CODES: Readonly<Record<Exclude<VerificationResult["status"], "verified">, IssueCode>> = {
  not_found: "CIT ✘",
  wrong_case: "CIT ≠",
  ambiguous: "CIT ?",
  unchecked: "CIT …",
};

/** The Issue a citation record is, or null (verified, linked, Other_Reference). */
function citationIssue(r: CitationRecord): Issue | null {
  const { start, end } = r.citation;
  if (r.kind === "full") {
    if (r.result.status === "verified") return null;
    return { key: r.key, kind: "citation", start, end, code: FULL_CODES[r.result.status] };
  }
  const value = r.citation.value;
  if (r.kind === "short" && value.kind === "short" && value.targetStart === null) {
    return { key: r.key, kind: "orphan", start, end, code: "CIT …" };
  }
  return null;
}

/** The Issue a quote record is, or null when it matches. */
function quoteIssue(r: QuoteRecord): Issue | null {
  if (r.result.status === "match") return null;
  const code: IssueCode = r.result.status === "mismatch" ? "QUO ✘" : "QUO …";
  return { key: r.key, kind: "quote", start: r.quote.start, end: r.quote.end, code };
}

/**
 * Every Issue of `doc` in `(start, citation first)` order (Req 18.1, 18.2),
 * each with the IssueCode the renderer emits for it.
 */
export function issues(doc: Document): readonly Issue[] {
  const order = issueOrder(
    doc.citations.map((r) => r.citation.start),
    doc.quotes.map((r) => r.quote.start),
  );
  const out: Issue[] = [];
  for (const { quote, index } of order) {
    const rec = quote ? doc.quotes[index] : doc.citations[index];
    if (rec === undefined) continue;
    const issue = "quote" in rec ? quoteIssue(rec) : citationIssue(rec);
    if (issue !== null) out.push(issue);
  }
  return out;
}

/** The Issues with no Override, in issue order (Req 18.1, 18.8). */
export function blockingIssues(doc: Document): readonly Issue[] {
  const overridden = new Set(doc.overrides.map((o) => o.key));
  return issues(doc).filter((i) => !overridden.has(i.key));
}

/** The Document's Overrides, stored in issue order (Req 18.7). */
export function overrides(doc: Document): readonly Override[] {
  return doc.overrides;
}

/**
 * Records an Override (Req 18.3 to 18.6). Checks `unknown_issue`, then
 * `empty_override_reason` (`reason.trim() === ""`), then `invalid_timestamp`.
 * The reason is stored verbatim, and the Document keeps one Override per key.
 */
export function recordOverride(
  doc: Document,
  key: IssueKey,
  reason: string,
  timestamp: string,
): Result<Document, EngineError> {
  const current = issues(doc);
  if (!current.some((i) => i.key === key)) return err({ kind: "unknown_issue", key });
  if (reason.trim() === "") return err({ kind: "empty_override_reason", key });
  if (!isTimestamp(timestamp)) return err({ kind: "invalid_timestamp", value: timestamp });
  const byKey = new Map(doc.overrides.map((o) => [o.key, o]));
  byKey.set(key, { key, reason, timestamp });
  const ordered: Override[] = [];
  for (const issue of current) {
    const o = byKey.get(issue.key);
    if (o !== undefined) ordered.push(o);
  }
  return ok({ ...doc, overrides: ordered });
}
