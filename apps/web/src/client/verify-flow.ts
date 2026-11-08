import { checkQuote } from "@reveal-codes/verifier/quote";
import type { Document, IssueKey, QuoteCheckResult } from "@reveal-codes/engine";
import type { Store } from "../store-runtime";
import type { ApiClient, FullRecord } from "./api";
import { FAILED_NOTICE, summaryNotice } from "./verify-summary";

export type FlowStore = Pick<Store, "getState" | "dispatch">;
export type VerifyOutcome = Readonly<{
  status: "completed" | "failed" | "discarded";
  citations: Readonly<{
    verified: number;
    not_found: number;
    ambiguous: number;
    unchecked: number;
  }>;
  quotes: Readonly<{ match: number; mismatch: number; unchecked: number }>;
  skipped: number;
  unavailable: number;
}>;

const NO_CITATIONS = { verified: 0, not_found: 0, ambiguous: 0, unchecked: 0 } as const;
const NO_QUOTES = { match: 0, mismatch: 0, unchecked: 0 } as const;

function fullRecords(document: Document): readonly FullRecord[] {
  return document.citations.filter((c): c is FullRecord => c.kind === "full");
}

/** Requirement 17.2: the only request body the flow builds for /api/verify. */
export function buildVerifyBody(document: Document): Readonly<{ records: readonly FullRecord[] }> {
  return { records: fullRecords(document) };
}

export function hasFullRecord(document: Document): boolean {
  return document.citations.some((c) => c.kind === "full");
}

/** The cluster of a verified Full_Citation at `start`, else null. */
function verifiedCluster(document: Document, start: number): string | null {
  const owner = document.citations.find((c) => c.citation.start === start);
  if (owner?.kind !== "full" || owner.result.status !== "verified") return null;
  return owner.result.clusterId;
}

/** A quote's owner is its citation, or for a Short_Form the full citation it links to. */
function ownerCluster(document: Document, citationStart: number): string | null {
  const attached = document.citations.find((c) => c.citation.start === citationStart);
  if (attached === undefined) return null;
  const value = attached.citation.value;
  if (attached.kind === "short" && value.kind === "short") {
    return value.targetStart === null ? null : verifiedCluster(document, value.targetStart);
  }
  return verifiedCluster(document, citationStart);
}

/** Requirement 17.5: quote keys of `verified` attached citations, grouped by cluster id, first-encounter order. */
export function quotesByCluster(document: Document): ReadonlyMap<string, readonly IssueKey[]> {
  const groups = new Map<string, IssueKey[]>();
  for (const q of document.quotes) {
    const cluster = ownerCluster(document, q.quote.citationStart);
    if (cluster === null) continue;
    const keys = groups.get(cluster);
    if (keys === undefined) groups.set(cluster, [q.key]);
    else keys.push(q.key);
  }
  return groups;
}

function tally(document: Document): Pick<VerifyOutcome, "citations" | "quotes"> {
  const citations = { ...NO_CITATIONS };
  for (const r of fullRecords(document)) citations[r.result.status] += 1;
  const quotes = { ...NO_QUOTES };
  for (const q of document.quotes) quotes[q.result.status] += 1;
  return { citations, quotes };
}

function outcome(
  status: VerifyOutcome["status"],
  store: FlowStore,
  skipped: number,
  unavailable: number,
): VerifyOutcome {
  const counts = status === "completed" ? tally(store.getState().document) : null;
  return {
    status,
    citations: counts?.citations ?? NO_CITATIONS,
    quotes: counts?.quotes ?? NO_QUOTES,
    skipped,
    unavailable,
  };
}

/** Checks the still-present quotes of one cluster against its opinion; returns the skipped count. */
function applyQuoteChecks(store: FlowStore, keys: readonly IssueKey[], opinion: string): number {
  const current = store.getState().document.quotes;
  const pairs: (readonly [IssueKey, QuoteCheckResult])[] = [];
  for (const key of keys) {
    const quote = current.find((q) => q.key === key);
    if (quote !== undefined) pairs.push([key, checkQuote(opinion, quote.quote.text)]);
  }
  return pairs.length === 0 ? 0 : store.dispatch({ type: "quoteCheck", pairs }).skipped;
}

type QuotePhase = Readonly<{ skipped: number; unavailable: number; discarded: boolean }>;

async function runQuotePhase(api: ApiClient, store: FlowStore, epoch: number): Promise<QuotePhase> {
  let skipped = 0;
  let unavailable = 0;
  for (const [clusterId, keys] of quotesByCluster(store.getState().document)) {
    const opinion = await api.opinion(clusterId);
    if (store.getState().epoch !== epoch) return { skipped, unavailable, discarded: true };
    if (!opinion.ok || opinion.value === null) unavailable += 1;
    else skipped += applyQuoteChecks(store, keys, opinion.value);
  }
  return { skipped, unavailable, discarded: false };
}

/** Never rejects: failures are returned as an outcome and shown as a Notice. */
export async function runVerifyFlow(
  api: ApiClient,
  store: FlowStore,
  now: () => Date,
): Promise<VerifyOutcome> {
  const epoch = store.getState().epoch;
  const verified = await api.verify(buildVerifyBody(store.getState().document).records);
  if (store.getState().epoch !== epoch) return outcome("discarded", store, 0, 0);
  if (!verified.ok) {
    store.dispatch({ type: "notice", text: FAILED_NOTICE });
    return outcome("failed", store, 0, 0);
  }
  const first = store.dispatch({ type: "verification", pairs: verified.value });
  const phase = await runQuotePhase(api, store, epoch);
  if (phase.discarded) return outcome("discarded", store, 0, 0);
  store.dispatch({ type: "verified", at: now().toISOString() });
  const done = outcome("completed", store, first.skipped + phase.skipped, phase.unavailable);
  store.dispatch({ type: "notice", text: summaryNotice(done) });
  return done;
}
