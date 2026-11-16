import { issues } from "@reveal-codes/engine";
import type { Document, Origin, Sentence, VerificationResult } from "@reveal-codes/engine";
import { localDateTime } from "./time.js";
import type {
  OriginCounts,
  RunInfo,
  StatementCitation,
  StatementOverride,
  StatementQuote,
  StatementTool,
} from "./types.js";

function zeroCounts(): Record<Origin, number> {
  return { HUM: 0, PST: 0, AI: 0, "AI>HUM": 0 };
}

/** UTF-16 code units of the text covered by spans of each origin. */
export function countCharacters(document: Document): OriginCounts {
  const counts = zeroCounts();
  for (const span of document.spans) {
    counts[span.provenance.origin] += span.end - span.start;
  }
  return counts;
}

/** Sentence tally by dominant origin; the four counts sum to `sentences.length`. */
export function countSentences(
  sentences: readonly Sentence[],
): Readonly<{ total: number; byDominantOrigin: OriginCounts }> {
  const counts = zeroCounts();
  for (const s of sentences) counts[s.dominantOrigin] += 1;
  return { total: sentences.length, byDominantOrigin: counts };
}

/** Tools of the runs in `document.runs`, first-occurrence order, equal pairs removed. */
export function toolsOf(document: Document, runLog: readonly RunInfo[]): readonly StatementTool[] {
  const used = new Set(document.runs.map((r) => r.runId));
  const out: StatementTool[] = [];
  for (const entry of runLog) {
    if (!used.has(entry.runId)) continue;
    const model = entry.modelId;
    const dup = out.some((t) => t.provider === entry.provider && t.model === model);
    if (!dup) out.push({ provider: entry.provider, model });
  }
  return out;
}

/** One entry per `kind: "full"` citation record, in document order. */
export function citationsOf(document: Document): readonly StatementCitation[] {
  const out: StatementCitation[] = [];
  for (const r of document.citations) {
    if (r.kind !== "full") continue;
    const text = r.citation.text;
    out.push(citationEntry(text, r.result));
  }
  return out;
}

function citationEntry(text: string, result: VerificationResult): StatementCitation {
  if (result.status === "verified") {
    return { text, status: result.status, clusterId: result.clusterId };
  }
  if (result.status === "wrong_case") {
    return {
      text,
      status: result.status,
      clusterId: result.clusterId,
      foundName: result.foundName,
      ...(result.foundYear === undefined ? {} : { foundYear: result.foundYear }),
    };
  }
  return { text, status: result.status };
}

/** One entry per quote record, in document order. */
export function quotesOf(document: Document): readonly StatementQuote[] {
  return document.quotes.map((r): StatementQuote => {
    const text = r.quote.text;
    return r.result.status === "mismatch"
      ? { text, status: r.result.status, prefixLength: r.result.prefixLength }
      : { text, status: r.result.status };
  });
}

/** Local `YYYY-MM-DD HH:MM` of a stored instant; the stored string when it is not a valid instant. */
function localTimestamp(timestamp: string): string {
  const d = new Date(timestamp);
  return Number.isNaN(d.getTime()) ? timestamp : localDateTime(d);
}

/** Overrides that belong to a current issue, in issue order. */
export function overridesOf(document: Document): readonly StatementOverride[] {
  const byKey = new Map(document.overrides.map((o) => [o.key, o]));
  const out: StatementOverride[] = [];
  for (const issue of issues(document)) {
    const o = byKey.get(issue.key);
    if (o === undefined) continue;
    out.push({
      code: issue.code,
      text: document.text.slice(issue.start, issue.end),
      reason: o.reason,
      timestamp: o.timestamp,
      timestampLocal: localTimestamp(o.timestamp),
    });
  }
  return out;
}

/** True when the span's origin is AI or AI>HUM. */
export function isAiSpan(span: Document["spans"][number]): boolean {
  return span.provenance.origin === "AI" || span.provenance.origin === "AI>HUM";
}
