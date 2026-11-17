import type { Document } from "@reveal-codes/engine";
import { CHECKS_BUSY } from "../notices";
import { TALLY_WORDS as W } from "./check-rows";
import type { VerifyOutcome } from "./verify-flow";

export const FAILED_NOTICE = "Verification could not be completed. Your citations are unchanged.";

export type CitationTally = Readonly<{
  verified: number;
  wrong_case: number;
  not_found: number;
  ambiguous: number;
  unchecked: number;
}>;
export type QuoteTally = Readonly<{ match: number; mismatch: number; unchecked: number }>;

/** Counts full citations and quotes by result status. */
export function tallyDocument(
  document: Document,
): Readonly<{ citations: CitationTally; quotes: QuoteTally }> {
  const citations = { verified: 0, wrong_case: 0, not_found: 0, ambiguous: 0, unchecked: 0 };
  for (const c of document.citations) if (c.kind === "full") citations[c.result.status] += 1;
  const quotes = { match: 0, mismatch: 0, unchecked: 0 };
  for (const q of document.quotes) quotes[q.result.status] += 1;
  return { citations, quotes };
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** Local "HH:MM" of an ISO timestamp; null when it does not parse. */
export function localTime(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Local "YYYY-MM-DD" of an ISO timestamp; null when it does not parse. */
export function localDate(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function line(label: string, terms: readonly (readonly [number, string])[]): string | null {
  const parts = terms.filter(([n]) => n > 0).map(([n, text]) => `${String(n)} ${text}`);
  return parts.length === 0 ? null : `${label}: ${parts.join(" · ")}`;
}

/** The lines of the Verify result: Citations, Quotations, Checked, then the further line. */
export function summaryLines(
  document: Document,
  checkedAt: string,
  further: string | null,
): readonly string[] {
  const { citations: c, quotes: q } = tallyDocument(document);
  const time = localTime(checkedAt);
  const lines = [
    line("Citations", [
      [c.verified, W.found],
      [c.wrong_case, W.wrongCase],
      [c.not_found, W.notFound],
      [c.ambiguous, W.ambiguous],
      [c.unchecked, W.notChecked],
    ]),
    line("Quotations", [
      [q.match, W.match],
      [q.mismatch, W.notInOpinion],
      [q.unchecked, W.notChecked],
    ]),
    time === null ? null : `Checked ${time}`,
    further,
  ];
  return lines.filter((l): l is string => l !== null);
}

function latestRetry(document: Document): number | null {
  let latest: number | null = null;
  for (const c of document.citations) {
    if (c.kind !== "full") continue;
    const result = c.result;
    if (result.status !== "unchecked" || result.waitUntil === undefined) continue;
    const at = Date.parse(result.waitUntil);
    if (!Number.isNaN(at) && (latest === null || at > latest)) latest = at;
  }
  return latest;
}

/** The sentence about items a later Verify could still check; null when there is none. */
export function furtherLine(outcome: VerifyOutcome, document: Document): string | null {
  if (outcome.status !== "completed") return null;
  if (outcome.limited === true) return CHECKS_BUSY;
  const retry = latestRetry(document);
  const time = retry === null ? null : localTime(new Date(retry).toISOString());
  if (time !== null) return `Some items were not checked; try Verify again after ${time}.`;
  if (outcome.skipped + outcome.unavailable > 0)
    return "Some items were skipped; try Verify again.";
  return null;
}
