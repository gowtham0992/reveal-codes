/**
 * Citation-layer pipeline stage (design A1 step 4, A3 step 7, A4, A5, A6;
 * Req 2.3, 4.6, 15.1, 15.4).
 *
 * `reanchorStage` is the single place where a Document's citation layer
 * (Citations, Quote_Candidates, Overrides, Issue_Key_Counter) is derived
 * after its Text, Spans, and Run table are settled.
 *
 * - At creation (`prev` is null) it runs the full Extractor and keys every
 *   item from counter 0, with every result `unchecked` (A1 step 4).
 * - After a primitive Insert or Delete it rescans the match layer
 *   incrementally (A5 layer 1), recomputes linking, Normalised_Forms, and
 *   quotes in full (layers 2 and 3), and re-anchors against `prev` (A6).
 *   Replace calls it once, with `prev` the original Document and the
 *   combined edit `[from, to) → [from, from + text.length)` (A4); `rescan`
 *   and `reanchor` take a general edit, so it needs nothing special here.
 *
 * The Document does not store its match layer. `matchesOf` rebuilds it from
 * `prev.citations`: every Citation record, Other_References included, is one
 * match of `prev.text`, in ascending `start`. Linking set each Short_Form's
 * `targetStart` and the Extractor added `normalised`; `scanRange` emits
 * neither, so both are reset. This equals `scanRange(prev.text)` whenever
 * `prev.citations` is the Extractor's output for `prev.text`, which every
 * Document built by `createDocument`, `apply`, or an Inverse satisfies.
 * Nothing here throws.
 */
import { assignKeys, reanchor } from "./anchor.js";
import type { CitationLayer, DraftDocument, Edit } from "./anchor.js";
import { extract, extractFromMatches } from "./citations/extract.js";
import { rescan } from "./citations/incremental.js";
import type { Match } from "./citations/scan.js";
import type { CitationRecord, CitationValue, Document } from "./types.js";

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

const unlinked = (v: CitationValue): CitationValue =>
  v.kind === "short" ? { ...v, targetStart: null } : v;

/** The scan-layer match a Citation record was extracted from. */
function matchOf(r: CitationRecord): Match {
  const { start, end, value } = r.citation;
  return { start, end, value: unlinked(value) };
}

/** The match layer of `doc.text`, rebuilt from `doc.citations`. */
export function matchesOf(doc: Document): readonly Match[] {
  return doc.citations.map(matchOf);
}

/** A1 step 4: the citation layer of a new Document. */
function creationLayer(text: string): CitationLayer {
  return { ...assignKeys(extract(text), 0), overrides: [] };
}

/**
 * Derives the citation layer of `input.draft` (A1 step 4 at creation, A3
 * step 7 after a primitive edit). Total and pure.
 */
export function reanchorStage({ prev, draft, edit }: ReanchorInput): CitationLayer {
  if (prev === null) return creationLayer(draft.text);
  const matches = rescan(matchesOf(prev), edit, draft.text);
  return reanchor(prev, draft, edit, extractFromMatches(draft.text, matches));
}
