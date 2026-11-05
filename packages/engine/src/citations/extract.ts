/**
 * The Extractor (design A9 overall, A5 layers 2 and 3; Req 9.1, 9.9, 11.2,
 * 11.3, 11.4). It composes the existing layers and adds nothing to them:
 *
 * 1. Match layer: `scanRange` over the whole Text (leftmost-longest,
 *    non-overlapping, ascending `start`).
 * 2. Link layer: `linkShortForms` sets every Short_Form's `targetStart`.
 * 3. Normalised_Form: for a Full_Citation, `format(value)`, recorded only
 *    when it differs from the text as written (Req 11.2, 11.4). Short_Forms
 *    and Other_References never carry one.
 * 4. Quote layer: `pairQuoteMarks`, then `attachQuotes` on the linked
 *    citations, which are already sorted by `start`.
 *
 * `extractFromMatches` takes a precomputed match list so the incremental
 * path (A5) can reuse layers 2 to 4. This module does not import
 * `segment.ts`. Every function is total and never throws.
 */

import type { CitationValue, ExtractedCitation, Extraction } from "../types.js";
import { format } from "./format.js";
import { linkShortForms } from "./link.js";
import { attachQuotes, pairQuoteMarks } from "./quotes.js";
import { scanRange, type Match } from "./scan.js";

const never = (): boolean => false;

const isFull = (v: CitationValue): boolean =>
  v.kind === "reporter" || v.kind === "parallel" || v.kind === "database";

/** The Normalised_Form of a Full_Citation written as `written`, or undefined. */
function normalisedOf(value: CitationValue, written: string): string | undefined {
  if (!isFull(value)) return undefined;
  const canonical = format(value);
  return canonical.ok && canonical.value !== written ? canonical.value : undefined;
}

/** One linked match as an ExtractedCitation, with its text and Normalised_Form. */
function toCitation(text: string, m: Match): ExtractedCitation {
  const written = text.slice(m.start, m.end);
  const base = { start: m.start, end: m.end, text: written, value: m.value };
  const normalised = normalisedOf(m.value, written);
  return normalised === undefined ? base : { ...base, normalised };
}

/**
 * Layers 2 to 4 over `matches`, which must be the match layer of `text`
 * (ascending `start`, pairwise non-overlapping, as `scanRange` returns them).
 * Any `normalised` already on a match is ignored and recomputed.
 */
export function extractFromMatches(text: string, matches: readonly Match[]): Extraction {
  const citations = linkShortForms(matches).map((m) => toCitation(text, m));
  const quotes = attachQuotes(text, pairQuoteMarks(text), citations);
  return { citations, quotes };
}

/**
 * Every Citation and Quote_Candidate in `text`, in ascending `start` order
 * (Req 9.1). Total on every string, including the empty string and strings
 * with unpaired surrogates (Req 9.9).
 */
export function extract(text: string): Extraction {
  return extractFromMatches(text, scanRange(text, 0, never));
}
