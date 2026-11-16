/**
 * The accumulator behind `arbTextWithCitations` (design "Arbitraries" table,
 * row `arbTextWithCitations`; Req 22.1, 22.4). Text is appended piece by
 * piece, and every Citation and Quote_Candidate the text should yield is
 * recorded at the moment its piece is written, with Offsets taken from the
 * running length. The expected `Extraction` is therefore built by
 * construction and never by calling `extract`.
 *
 * Links follow Req 12 directly: an `Id.` refers to the previous citation's
 * target (the previous Full_Citation itself, a linked Short_Form's target,
 * or nothing after an Other_Reference or an Orphan; Req 12.1, 12.3, 12.6,
 * 12.7), and a party Short_Form refers to the last Full_Citation with its
 * `(volume, reporter)` (Req 12.2). The builder is test-only and mutable;
 * `cloneBuilder` takes the snapshot the caller rolls back to.
 */
import { format } from "../citations/format.js";
import type {
  CitationValue,
  ExtractedCitation,
  ExtractedQuote,
  FullValue,
  OtherValue,
  QuoteRule,
} from "../types.js";

/** A `(volume, reporter)` pair, the key party Short_Forms link by. */
export type Pair = Readonly<{ volume: number; reporter: string }>;

/** A Full_Citation and its Canonical_Form. */
export type FullCite = Readonly<{ kind: "full"; value: FullValue; text: string }>;

/** `Id.` (`pincite` null) or `Id. at <pincite>`. */
export type IdCite = Readonly<{
  kind: "id";
  pincite: number | null;
  /** The Pincite_Expression as written; absent means `String(pincite)`. */
  pinciteText?: string;
}>;

/** How a builder writes a pincite: one page, or a Pincite_Expression (Req 18). */
export type PinciteStyle = "single" | "expression";

/**
 * A party Short_Form. Its pair is the `pick`-th distinct pair written so far
 * (modulo their count), or `fallback` when `pick` is null or none exists.
 */
export type PartyCite = Readonly<{
  kind: "party";
  party: string;
  pick: number | null;
  fallback: Pair;
  pincite: number;
  /** The Pincite_Expression as written; absent means `String(pincite)`. */
  pinciteText?: string;
}>;

/** A Full_Citation or Short_Form, the citing pieces quote groups use. */
export type Cite = FullCite | IdCite | PartyCite;

export type Builder = {
  text: string;
  citations: ExtractedCitation[];
  quotes: ExtractedQuote[];
  /** Distinct pairs in order of first appearance. */
  pairs: Pair[];
  byPair: Map<string, number>;
  /** What an `Id.` here links to. */
  prev: number | null;
};

const keyOf = (p: Pair): string => `${String(p.volume)} ${p.reporter}`;

export function newBuilder(): Builder {
  return { text: "", citations: [], quotes: [], pairs: [], byPair: new Map(), prev: null };
}

export function cloneBuilder(b: Builder): Builder {
  return {
    text: b.text,
    citations: [...b.citations],
    quotes: [...b.quotes],
    pairs: [...b.pairs],
    byPair: new Map(b.byPair),
    prev: b.prev,
  };
}

/** Appends plain text that holds no citation and no quotation mark. */
export function put(b: Builder, s: string): void {
  b.text += s;
}

/** Appends `text` as one citation with `value`, returning its start. */
function record(b: Builder, text: string, value: CitationValue, normalised?: string): number {
  const start = b.text.length;
  b.text += text;
  const base = { start, end: b.text.length, text, value };
  b.citations.push(normalised === undefined ? base : { ...base, normalised });
  return start;
}

/** The pairs a Full_Citation contributes (none for a Database_Citation). */
function pairsOf(value: FullValue): readonly Pair[] {
  if (value.kind === "reporter") return [{ volume: value.volume, reporter: value.reporter }];
  if (value.kind === "parallel") {
    return value.members.map((m) => ({ volume: m.volume, reporter: m.reporter }));
  }
  return [];
}

/**
 * Appends a Full_Citation as written, with its Normalised_Form if any. A
 * LEXIS citation is joined like any other: an earlier number cannot start a
 * longer LEXIS match, because its court would hold this citation's year as a
 * token (A9 step 2, D22).
 */
export function putFull(b: Builder, value: FullValue, text: string, normalised?: string): number {
  const start = record(b, text, value, normalised);
  for (const p of pairsOf(value)) {
    if (!b.byPair.has(keyOf(p))) b.pairs.push(p);
    b.byPair.set(keyOf(p), start);
  }
  b.prev = start;
  return start;
}

/** Appends an Other_Reference; a following `Id.` is an Orphan (Req 12.6). */
export function putOther(b: Builder, text: string, value: OtherValue): number {
  const start = record(b, text, value);
  b.prev = null;
  return start;
}

function putId(b: Builder, c: IdCite): number {
  const targetStart = b.prev;
  if (c.pincite === null) {
    return record(b, "Id.", { kind: "short", form: "id", targetStart });
  }
  const text = `Id. at ${c.pinciteText ?? String(c.pincite)}`;
  return record(b, text, { kind: "short", form: "id", pincite: c.pincite, targetStart });
}

function putParty(b: Builder, c: PartyCite): number {
  const pair =
    c.pick === null || b.pairs.length === 0
      ? c.fallback
      : (b.pairs[c.pick % b.pairs.length] ?? c.fallback);
  const targetStart = b.byPair.get(keyOf(pair)) ?? null;
  const text = `${c.party}, ${String(pair.volume)} ${pair.reporter} at ${c.pinciteText ?? String(c.pincite)}`;
  const value: CitationValue = {
    kind: "short",
    form: "party",
    party: c.party,
    volume: pair.volume,
    reporter: pair.reporter,
    pincite: c.pincite,
    targetStart,
  };
  const start = record(b, text, value);
  b.prev = targetStart;
  return start;
}

/** Appends a citing piece and returns its start Offset. */
export function putCite(b: Builder, c: Cite): number {
  switch (c.kind) {
    case "full": {
      // A text written with a range or list is not canonical, so it records the Normalised_Form (D17).
      const form = canonical(c.value);
      return putFull(b, c.value, c.text, c.text === form ? undefined : form);
    }
    case "id":
      return putId(b, c);
    case "party":
      return putParty(b, c);
  }
}

/** The Canonical_Form of a valid Full_Citation value, or "" if `format` rejects it. */
export function canonical(value: FullValue): string {
  const r = format(value);
  return r.ok ? r.value : "";
}

/** The content range of one written Quotation_Pair. */
export type QuoteRange = Readonly<{ start: number; end: number; text: string }>;

/** Appends `open + content + close` and returns the content range. */
export function putQuote(b: Builder, curly: boolean, content: string): QuoteRange {
  b.text += curly ? "“" : '"';
  const start = b.text.length;
  b.text += content + (curly ? "”" : '"');
  return { start, end: start + content.length, text: content };
}

/** Records `r` as a Quote_Candidate attached to the citation at `citationStart`. */
export function attach(b: Builder, r: QuoteRange, citationStart: number, rule: QuoteRule): void {
  b.quotes.push({ ...r, citationStart, rule });
}
