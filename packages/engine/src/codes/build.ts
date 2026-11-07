/**
 * Build step of `parse` (design A12 step 4; Req 20.1, 20.2).
 *
 * Turns a CheckedDraft (the decoded draft plus the Extractor output it was
 * checked against) into a Document. Codes carry no Citation_Values, link
 * targets, or quote rules, so those come from the Extractor; statuses, quote
 * results, keys, and Overrides come from the draft. Spans are already
 * canonical because check verified canonical form. Total: nothing throws.
 */
import { issueOrder } from "../anchor-keys.js";
import { err, ok } from "../result.js";
import type { Result } from "../result.js";
import type {
  CitationRecord,
  Document,
  ExtractedCitation,
  Override,
  QuoteRecord,
  Span,
  VerificationResult,
} from "../types.js";
import { fault, rangeKey } from "./check-types.js";
import type { CheckFault, CheckedDraft } from "./check-types.js";
import type { DraftCitation, DraftOverride, DraftQuote, DraftStatus } from "./decode-types.js";

const mismatch = (): CheckFault => fault(0, "extractor_mismatch");

/** The Verification_Result a Full_Citation Code stands for (payload form, Req 16.2). */
function resultOf(s: DraftStatus): VerificationResult {
  switch (s.status) {
    case "verified":
      return { status: "verified", clusterId: s.clusterId ?? "" };
    case "ambiguous":
      return { status: "ambiguous", candidates: s.candidates ?? [] };
    case "not_found":
      return s.reason === undefined
        ? { status: "not_found" }
        : { status: "not_found", reason: s.reason };
    case "unchecked":
      return s.waitUntil === undefined
        ? { status: "unchecked" }
        : { status: "unchecked", waitUntil: s.waitUntil };
  }
}

function citationRecord(c: ExtractedCitation, d: DraftCitation | undefined): CitationRecord | null {
  if (c.value.kind === "other") return { kind: "other", citation: c };
  if (d === undefined) return null;
  if (c.value.kind === "short") return { kind: "short", key: d.key, citation: c };
  return { kind: "full", key: d.key, citation: c, result: resultOf(d.status) };
}

function citationRecords(done: CheckedDraft): CitationRecord[] | null {
  const byRange = new Map(done.draft.citations.map((d) => [rangeKey(d.start, d.end), d] as const));
  const out: CitationRecord[] = [];
  for (const c of done.extraction.citations) {
    const rec = citationRecord(c, byRange.get(rangeKey(c.start, c.end)));
    if (rec === null) return null;
    out.push(rec);
  }
  return out;
}

function quoteRecords(done: CheckedDraft): QuoteRecord[] | null {
  const byRange = new Map(done.draft.quotes.map((d) => [rangeKey(d.start, d.end), d] as const));
  const out: QuoteRecord[] = [];
  for (const q of done.extraction.quotes) {
    const d: DraftQuote | undefined = byRange.get(rangeKey(q.start, q.end));
    if (d === undefined) return null;
    out.push({ key: d.key, quote: q, result: d.result });
  }
  return out;
}

const asOverride = (key: string, o: DraftOverride): Override => ({
  key,
  reason: o.reason,
  timestamp: o.timestamp,
});

/** Overrides in issue order (Req 18.7), one per key. */
function buildOverrides(
  done: CheckedDraft,
  citations: readonly CitationRecord[],
  quotes: readonly QuoteRecord[],
): Override[] {
  const byKey = new Map<string, Override>();
  for (const c of done.draft.citations) {
    if (c.override !== undefined) byKey.set(c.key, asOverride(c.key, c.override));
  }
  for (const q of done.draft.quotes) {
    if (q.override !== undefined) byKey.set(q.key, asOverride(q.key, q.override));
  }
  const order = issueOrder(
    citations.map((r) => r.citation.start),
    quotes.map((r) => r.quote.start),
  );
  const out: Override[] = [];
  for (const { quote, index } of order) {
    const rec = quote ? quotes[index] : citations[index];
    const key = rec === undefined || !("key" in rec) ? undefined : rec.key;
    const o = key === undefined ? undefined : byKey.get(key);
    if (o !== undefined) out.push(o);
  }
  return out;
}

/** Builds the Document a checked draft stands for. */
export function build(done: CheckedDraft): Result<Document, CheckFault> {
  const citations = citationRecords(done);
  const quotes = quoteRecords(done);
  if (citations === null || quotes === null) return err(mismatch());
  const spans: Span[] = done.draft.spans.map((s) => ({
    start: s.start,
    end: s.end,
    provenance: s.provenance,
  }));
  return ok({
    text: done.draft.text,
    spans,
    runs: done.draft.runs,
    citations,
    quotes,
    overrides: buildOverrides(done, citations, quotes),
    keyCounter: done.draft.keyCounter,
  });
}
