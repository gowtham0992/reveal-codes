/**
 * Issue_Key assignment and Override cleanup (design A6 steps 6 and 7, A1
 * step 4; Req 15.5, 15.7, 15.8, Glossary "Issue_Key assignment").
 *
 * Items are visited in issue order: ascending start Offset, with a Citation
 * before a Quote_Candidate at an equal start (Req 18.1). An item that was
 * carried over keeps its previous record's key and result; every other
 * Full_Citation, Short_Form, and Quote_Candidate gets `k<n>` from the
 * counter, which then increments. Other_References get no key and do not
 * advance the counter. Every function is total and never throws.
 */
import type {
  CitationRecord,
  ExtractedCitation,
  ExtractedQuote,
  Extraction,
  IssueKey,
  Override,
  QuoteRecord,
} from "./types.js";

/**
 * Previous records carried over, aligned by index with an Extraction's
 * citations and quotes; `null` means the item needs a fresh key. A carried
 * Full_Citation must be a `full` record and a carried Short_Form a `short`
 * record; anything else is treated as `null`.
 */
export type Carry = Readonly<{
  citations: readonly (CitationRecord | null)[];
  quotes: readonly (QuoteRecord | null)[];
}>;

/** The keyed citation layer `assignKeys` returns, without Overrides. */
export type KeyedLayer = Readonly<{
  citations: readonly CitationRecord[];
  quotes: readonly QuoteRecord[];
  keyCounter: number;
}>;

/** One step of the issue-order walk: a citation or quote index. */
export type Slot = Readonly<{ quote: boolean; index: number }>;

const NO_CARRY: Carry = { citations: [], quotes: [] };

/** Merges two ascending start lists in issue order (Req 18.1 tie-break). */
export function issueOrder(
  citationStarts: readonly number[],
  quoteStarts: readonly number[],
): readonly Slot[] {
  const out: Slot[] = [];
  let i = 0;
  let j = 0;
  while (i < citationStarts.length || j < quoteStarts.length) {
    const c = citationStarts[i];
    const q = quoteStarts[j];
    if (c !== undefined && (q === undefined || c <= q)) {
      out.push({ quote: false, index: i });
      i += 1;
    } else {
      out.push({ quote: true, index: j });
      j += 1;
    }
  }
  return out;
}

type Counter = { n: number };

const fresh = (counter: Counter): IssueKey => {
  const key = `k${String(counter.n)}`;
  counter.n += 1;
  return key;
};

/** The record for one extracted citation, carrying `prev` over when it fits. */
function citationRecord(
  c: ExtractedCitation,
  prev: CitationRecord | null,
  counter: Counter,
): CitationRecord {
  switch (c.value.kind) {
    case "other":
      return { kind: "other", citation: c };
    case "short":
      return prev?.kind === "short"
        ? { kind: "short", key: prev.key, citation: c }
        : { kind: "short", key: fresh(counter), citation: c };
    default:
      return prev?.kind === "full"
        ? { kind: "full", key: prev.key, citation: c, result: prev.result }
        : { kind: "full", key: fresh(counter), citation: c, result: { status: "unchecked" } };
  }
}

/** The record for one extracted quote, carrying `prev` over when given. */
function quoteRecord(q: ExtractedQuote, prev: QuoteRecord | null, counter: Counter): QuoteRecord {
  return prev === null
    ? { key: fresh(counter), quote: q, result: { status: "unchecked" } }
    : { key: prev.key, quote: q, result: prev.result };
}

/**
 * Keys every item of `extraction`, starting the counter at `counter`. With
 * no `carry` (creation, A1 step 4) every Full_Citation and quote is
 * `unchecked` and every keyed item gets a fresh key.
 */
export function assignKeys(
  extraction: Extraction,
  counter: number,
  carry: Carry = NO_CARRY,
): KeyedLayer {
  const { citations, quotes } = extraction;
  const order = issueOrder(
    citations.map((c) => c.start),
    quotes.map((q) => q.start),
  );
  const state: Counter = { n: counter };
  const outC: CitationRecord[] = [];
  const outQ: QuoteRecord[] = [];
  for (const { quote, index } of order) {
    if (quote) {
      outQ.push(quoteRecord(quotes[index] as ExtractedQuote, carry.quotes[index] ?? null, state));
    } else {
      const c = citations[index] as ExtractedCitation;
      outC.push(citationRecord(c, carry.citations[index] ?? null, state));
    }
  }
  return { citations: outC, quotes: outQ, keyCounter: state.n };
}

/** True when a citation record is an Issue (Req 18.2). */
function citationIsIssue(r: CitationRecord): boolean {
  if (r.kind === "full") return r.result.status !== "verified";
  return (
    r.kind === "short" && r.citation.value.kind === "short" && r.citation.value.targetStart === null
  );
}

/** The key and Issue status of the item at `slot`, or null for an Other_Reference. */
function slotIssue(
  layer: KeyedLayer,
  slot: Slot,
): Readonly<{ key: IssueKey; issue: boolean }> | null {
  if (slot.quote) {
    const q = layer.quotes[slot.index] as QuoteRecord;
    return { key: q.key, issue: q.result.status !== "match" };
  }
  const r = layer.citations[slot.index] as CitationRecord;
  return r.kind === "other" ? null : { key: r.key, issue: citationIsIssue(r) };
}

/**
 * Design A6 step 7 (Req 15.8): the previous Overrides whose key belongs to a
 * carried-over item that is still an Issue in `layer`, in issue order, one
 * per key.
 */
export function keptOverrides(
  previous: readonly Override[],
  layer: KeyedLayer,
  carried: ReadonlySet<IssueKey>,
): readonly Override[] {
  const byKey = new Map(previous.map((o) => [o.key, o]));
  const order = issueOrder(
    layer.citations.map((r) => r.citation.start),
    layer.quotes.map((r) => r.quote.start),
  );
  const out: Override[] = [];
  for (const slot of order) {
    const item = slotIssue(layer, slot);
    const o = item === null ? undefined : byKey.get(item.key);
    if (item !== null && item.issue && carried.has(item.key) && o !== undefined) out.push(o);
  }
  return out;
}
