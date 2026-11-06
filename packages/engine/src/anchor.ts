/**
 * Re-anchoring of the citation layer (design A1 step 4, A6). The pipeline
 * stage that calls it, `reanchorStage`, lives in `citation-layer.ts`.
 *
 * Re-anchoring (design A6; Req 15.2 to 15.8) is implemented below the stage:
 *
 * - `mapRange` maps a previous range through an Edit: an Insert's, a
 *   Delete's, or a Replace's single combined Edit (Req 15.3).
 * - `reanchor` carries over Full_Citations (A6 step 3), Short_Forms with
 *   link targets compared through the mapping (step 4, D5), and
 *   Quote_Candidates under conditions a to d (step 5), then issues fresh
 *   keys and cleans up Overrides (steps 6 and 7).
 * - `assignKeys` is shared with creation (A1 step 4), where nothing is
 *   carried over.
 *
 * An Edit that does not describe the change from `prev.text` to the new Text
 * (non-integer, out of order, or with the wrong length change) cannot come
 * from the pipeline; `reanchor` then treats every previous range as touched,
 * so everything resets with fresh keys. Nothing here throws.
 */
import { assignKeys, keptOverrides } from "./anchor-keys.js";
import { structuralEqual } from "./equal.js";
import type {
  CitationRecord,
  CitationValue,
  Document,
  ExtractedCitation,
  ExtractedQuote,
  Extraction,
  IssueKey,
  Override,
  QuoteRecord,
  RunEntry,
  Span,
} from "./types.js";

export { assignKeys, issueOrder, type Carry, type KeyedLayer } from "./anchor-keys.js";

/** One edit: Text range [from, oldTo) became [from, newTo); a Replace is one such edit. */
export type Edit = Readonly<{ from: number; oldTo: number; newTo: number }>;

/**
 * A Document whose Text, Spans, and Run table are final but whose citation
 * layer has not been derived yet.
 */
export type DraftDocument = Readonly<{
  text: string;
  spans: readonly Span[];
  runs: readonly RunEntry[];
}>;

/** The part of a Document that `reanchorStage` derives. */
export type CitationLayer = Readonly<{
  citations: readonly CitationRecord[];
  quotes: readonly QuoteRecord[];
  overrides: readonly Override[];
  keyCounter: number;
}>;

/** Edit describing creation: the empty Text became `[0, length)`. */
export function creationEdit(length: number): Edit {
  return { from: 0, oldTo: 0, newTo: length };
}

/** Joins a draft and its citation layer into a Document. */
export function withLayer(draft: DraftDocument, layer: CitationLayer): Document {
  return {
    text: draft.text,
    spans: draft.spans,
    runs: draft.runs,
    citations: layer.citations,
    quotes: layer.quotes,
    overrides: layer.overrides,
    keyCounter: layer.keyCounter,
  };
}

// Re-anchoring (design A6)

export type Range = Readonly<{ start: number; end: number }>;

/**
 * Req 15.3: the image of a previous range under `edit`, or null when the
 * edit touches it. A pure insertion (`from === oldTo`) touches the range only
 * strictly inside it; a deletion or a Replace's combined edit touches it
 * when `[from, oldTo)` and the range share a code unit.
 * Untouched ranges at or after `oldTo` shift by `newTo − oldTo`.
 */
export function mapRange(range: Range, edit: Edit): Range | null {
  const { start, end } = range;
  const { from, oldTo, newTo } = edit;
  const untouched = from === oldTo ? from <= start || from >= end : oldTo <= start || from >= end;
  if (!untouched) return null;
  const delta = start >= oldTo ? newTo - oldTo : 0;
  return { start: start + delta, end: end + delta };
}

/** True when `edit` turns a Text of `oldLength` into one of `newLength`. */
function fitsLengths(edit: Edit, oldLength: number, newLength: number): boolean {
  const { from, oldTo, newTo } = edit;
  const ints = Number.isInteger(from) && Number.isInteger(oldTo) && Number.isInteger(newTo);
  return (
    ints &&
    from >= 0 &&
    from <= oldTo &&
    oldTo <= oldLength &&
    from <= newTo &&
    newTo <= newLength &&
    newTo - oldTo === newLength - oldLength
  );
}

type Mapped<T> = Readonly<{ record: T; end: number }>;

/** Untouched records indexed by mapped start (injective, A6 step 2). */
function indexByMappedStart<T>(
  records: readonly T[],
  rangeOf: (r: T) => Range,
  edit: Edit | null,
): ReadonlyMap<number, Mapped<T>> {
  const index = new Map<number, Mapped<T>>();
  if (edit === null) return index;
  for (const record of records) {
    const m = mapRange(rangeOf(record), edit);
    if (m !== null) index.set(m.start, { record, end: m.end });
  }
  return index;
}

/** Carry-over context: previous keys by start, carried new keys by start. */
type Links = Readonly<{
  oldKeyAt: ReadonlyMap<number, IssueKey>;
  newKeyAt: Map<number, IssueKey>;
}>;

const withoutTarget = (v: CitationValue): CitationValue =>
  v.kind === "short" ? { ...v, targetStart: null } : v;

const targetOf = (v: CitationValue): number | null => (v.kind === "short" ? v.targetStart : null);

/** D5: both Orphans, or the new target is the carried-over image of the old one. */
function sameTarget(old: number | null, next: number | null, links: Links): boolean {
  if (old === null || next === null) return old === next;
  const key = links.oldKeyAt.get(old);
  return key !== undefined && links.newKeyAt.get(next) === key;
}

/** A6 steps 3 and 4: whether `p`, already at the mapped start, carries over to `c`. */
function citationCarries(p: Mapped<CitationRecord>, c: ExtractedCitation, links: Links): boolean {
  const prev = p.record.citation;
  if (p.end !== c.end || prev.text !== c.text) return false;
  if (p.record.kind === "full") {
    return (
      c.value.kind !== "short" &&
      c.value.kind !== "other" &&
      structuralEqual(prev.value, c.value) &&
      prev.normalised === c.normalised
    );
  }
  return (
    p.record.kind === "short" &&
    c.value.kind === "short" &&
    structuralEqual(withoutTarget(prev.value), withoutTarget(c.value)) &&
    sameTarget(targetOf(prev.value), targetOf(c.value), links)
  );
}

type KeyedCitation = Exclude<CitationRecord, Readonly<{ kind: "other" }>>;

const isKeyed = (r: CitationRecord): r is KeyedCitation => r.kind !== "other";

/** Carried previous citation records, aligned with `citations`. */
function carryCitations(
  prev: Document,
  citations: readonly ExtractedCitation[],
  edit: Edit | null,
  links: Links,
): readonly (KeyedCitation | null)[] {
  const keyed = prev.citations.filter(isKeyed);
  const index = indexByMappedStart(keyed, (r) => r.citation, edit);
  return citations.map((c) => {
    const p = index.get(c.start);
    if (p === undefined || !citationCarries(p, c, links)) return null;
    links.newKeyAt.set(c.start, p.record.key);
    return p.record;
  });
}

/** A6 step 5 (Req 15.6, 15.7): whether `p`, at the mapped start, carries over to `q`. */
function quoteCarries(p: Mapped<QuoteRecord>, q: ExtractedQuote, links: Links): boolean {
  const prev = p.record.quote;
  const attached = links.newKeyAt.get(q.citationStart);
  return (
    p.end === q.end &&
    prev.text === q.text &&
    prev.rule === q.rule &&
    attached !== undefined &&
    attached === links.oldKeyAt.get(prev.citationStart)
  );
}

/** Carried previous quote records, aligned with `quotes`. */
function carryQuotes(
  prev: Document,
  quotes: readonly ExtractedQuote[],
  edit: Edit | null,
  links: Links,
): readonly (QuoteRecord | null)[] {
  const index = indexByMappedStart(prev.quotes, (r) => r.quote, edit);
  return quotes.map((q) => {
    const p = index.get(q.start);
    return p !== undefined && quoteCarries(p, q, links) ? p.record : null;
  });
}

/** Keys of previous keyed citations by their start. */
function keysByStart(prev: Document): ReadonlyMap<number, IssueKey> {
  const out = new Map<number, IssueKey>();
  for (const r of prev.citations) if (r.kind !== "other") out.set(r.citation.start, r.key);
  return out;
}

/** The keys of every non-null carried record. */
function carriedKeys(records: readonly (Readonly<{ key: IssueKey }> | null)[]): IssueKey[] {
  return records.flatMap((r) => (r === null ? [] : [r.key]));
}

/**
 * Design A6: the citation layer of `draft` given its Extractor output
 * `extraction`, the previous Document `prev`, and the primitive `edit` that
 * turned `prev.text` into `draft.text`. Carried-over items keep key, result,
 * and Override; every other item is `unchecked` with a fresh key and no
 * Override (Req 15.2 to 15.8). Total and pure.
 */
export function reanchor(
  prev: Document,
  draft: DraftDocument,
  edit: Edit,
  extraction: Extraction,
): CitationLayer {
  const mapping = fitsLengths(edit, prev.text.length, draft.text.length) ? edit : null;
  const links: Links = { oldKeyAt: keysByStart(prev), newKeyAt: new Map() };
  const citations = carryCitations(prev, extraction.citations, mapping, links);
  const quotes = carryQuotes(prev, extraction.quotes, mapping, links);
  const layer = assignKeys(extraction, prev.keyCounter, { citations, quotes });
  const carried = new Set([...carriedKeys(citations), ...carriedKeys(quotes)]);
  const overrides: readonly Override[] = keptOverrides(prev.overrides, layer, carried);
  return { ...layer, overrides };
}
