import { setQuoteCheck, setVerification } from "@reveal-codes/engine";
import type { Document, IssueKey, VerificationResult } from "@reveal-codes/engine";
import { checkQuote, fetchOpinionText, lookup } from "@reveal-codes/verifier";
import type { Deps } from "@reveal-codes/verifier";
import { quotesByCluster } from "./owners.js";

export type Unavailable = Readonly<{ waitUntil: string | null }>;

export type ReverifyOutcome = Readonly<{
  /** The Reverified_Document: used only as the argument of `issues`. */
  document: Document;
  /** Non-null when any re-check was unavailable; `waitUntil` is the latest one carried by an unchecked citation result. */
  unavailable: Unavailable | null;
  /** Keys whose setVerification or setQuoteCheck the Engine rejected. No Finding is made for them. */
  notRechecked: readonly IssueKey[];
}>;

type Step = Readonly<{
  document: Document;
  unavailable: Unavailable | null;
  notRechecked: readonly IssueKey[];
}>;

/** The later of two raw `waitUntil` values by `Date.parse`; an unparseable value never wins. */
function laterWaitUntil(current: string | null, next: string | undefined): string | null {
  if (next === undefined || Number.isNaN(Date.parse(next))) return current;
  if (current === null) return next;
  return Date.parse(next) > Date.parse(current) ? next : current;
}

function markUnavailable(step: Step, waitUntil?: string): Step {
  const latest = laterWaitUntil(step.unavailable?.waitUntil ?? null, waitUntil);
  return { ...step, unavailable: { waitUntil: latest } };
}

function reject(step: Step, key: IssueKey): Step {
  return { ...step, notRechecked: [...step.notRechecked, key] };
}

function applyCitation(step: Step, key: IssueKey, result: VerificationResult): Step {
  if (result.status === "unchecked") return markUnavailable(step, result.waitUntil);
  const next = setVerification(step.document, key, result);
  return next.ok ? { ...step, document: next.value } : reject(step, key);
}

function applyCitations(start: Step, results: ReadonlyMap<IssueKey, VerificationResult>): Step {
  let step = start;
  for (const record of start.document.citations) {
    if (record.kind !== "full") continue;
    step = applyCitation(step, record.key, results.get(record.key) ?? { status: "unchecked" });
  }
  return step;
}

function applyQuotes(step: Step, keys: readonly IssueKey[], opinion: string): Step {
  let current = step;
  for (const key of keys) {
    const quote = current.document.quotes.find((q) => q.key === key);
    if (quote === undefined) continue;
    const result = checkQuote(opinion, quote.quote.text);
    if (result.status === "unchecked") continue;
    const next = setQuoteCheck(current.document, key, result);
    current = next.ok ? { ...current, document: next.value } : reject(current, key);
  }
  return current;
}

/** Opinions are fetched one cluster after another, never concurrently, in first-encounter order. */
async function checkQuotes(start: Step, deps: Deps): Promise<Step> {
  let step = start;
  for (const [clusterId, keys] of quotesByCluster(start.document)) {
    const opinion = await fetchOpinionText(clusterId, deps);
    step = opinion === null ? markUnavailable(step) : applyQuotes(step, keys, opinion);
  }
  return step;
}

/** One `lookup` for all citations, then one opinion fetch per cluster. Never mutates `document`. */
export async function reverify(document: Document, deps: Deps): Promise<ReverifyOutcome> {
  const results = await lookup(document.citations, deps);
  const afterCitations = applyCitations({ document, unavailable: null, notRechecked: [] }, results);
  return checkQuotes(afterCitations, deps);
}
