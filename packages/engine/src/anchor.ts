/**
 * Citation-layer pipeline stage (design A1 step 4, A3 step 7, A6).
 *
 * `reanchorStage` is the single place where a Document's citation layer
 * (Citations, Quote_Candidates, Overrides, Issue_Key_Counter) is derived
 * after its Text, Spans, and Run table are settled. It runs both at creation
 * (`prev` is null) and after every primitive Insert or Delete (`prev` is the
 * Document before the edit).
 *
 * Until task 5.41 the Extractor is not wired in, so the stage returns empty
 * Citations, Quote_Candidates, and Overrides and leaves the counter unchanged
 * (0 at creation). Task 5.41 replaces the body with `rescan`,
 * `linkShortForms`, quote pairing and attachment, and `reanchor`/`assignKeys`
 * without changing this signature.
 */
import type { CitationRecord, Document, Override, QuoteRecord, RunEntry, Span } from "./types.js";

/** One primitive edit: Text range [from, oldTo) became [from, newTo). */
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

/**
 * Input to `reanchorStage`. `prev` is the Document before `edit`, or null at
 * creation, where `edit` is `creationEdit(draft.text.length)`. `draft` holds
 * the post-edit Text, Spans, and Run table.
 */
export type ReanchorInput = Readonly<{
  prev: Document | null;
  draft: DraftDocument;
  edit: Edit;
}>;

/**
 * Derives the citation layer of `input.draft`. Placeholder until task 5.41:
 * empty Citations, Quote_Candidates, and Overrides, with the counter carried
 * over from `prev` (0 at creation). Task 5.41 reads `draft` and `edit` too.
 * Total and pure.
 */
export function reanchorStage({ prev }: ReanchorInput): CitationLayer {
  return {
    citations: [],
    quotes: [],
    overrides: [],
    keyCounter: prev === null ? 0 : prev.keyCounter,
  };
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
