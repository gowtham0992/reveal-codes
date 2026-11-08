import { issues } from "@reveal-codes/engine";
import type { Document, Origin, Sentence } from "@reveal-codes/engine";
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
    out.push(
      r.result.status === "verified"
        ? { text, status: r.result.status, clusterId: r.result.clusterId }
        : { text, status: r.result.status },
    );
  }
  return out;
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

/** True when some span has origin AI or AI>HUM. */
export function usedAi(document: Document): boolean {
  return document.spans.some(
    (s) => s.provenance.origin === "AI" || s.provenance.origin === "AI>HUM",
  );
}
