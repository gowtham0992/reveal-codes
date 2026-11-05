/**
 * The Reporter_List and its lookup indexes (design "Reporter list
 * generation", A9 step 3; Req 11.5, 14.1, 14.3, 14.5, 14.6).
 *
 * `reporters.json` is the only reporter list in the Engine (Req 14.1). It is
 * a static module import, so nothing is read from disk or network at run
 * time. Both indexes are derived from it once at module load and map a key to
 * the position of the first entry with that key, so `reporters.json` order
 * decides every collision (Req 11.5, 14.6).
 */

import { buildAbbreviationIndex, type AbbreviationIndex } from "../abbreviations.js";
import reporters from "./reporters.json" with { type: "json" };

/** The Reporter_List, in `reporters.json` (reporters-db) order. */
export const REPORTERS: readonly string[] = reporters;

/**
 * The Near_Miss key of a token or entry: every `.` and ASCII space removed,
 * case preserved (Req 11.1).
 */
export function collapseReporter(token: string): string {
  return token.replace(/[. ]/g, "");
}

/** Maps each key to the index of the first entry that produces it. */
function firstIndexBy(entries: readonly string[], key: (e: string) => string): Map<string, number> {
  const index = new Map<string, number>();
  entries.forEach((entry, i) => {
    const k = key(entry);
    if (k.length > 0 && !index.has(k)) index.set(k, i);
  });
  return index;
}

/** Entry text to its position in `REPORTERS`. */
export const exactIndex: ReadonlyMap<string, number> = firstIndexBy(REPORTERS, (e) => e);

/** Collapsed entry text to the position of the first entry with that key. */
export const collapsedIndex: ReadonlyMap<string, number> = firstIndexBy(
  REPORTERS,
  collapseReporter,
);

/**
 * Resolves a reporter token to its Reporter_List entry, spelled exactly as in
 * the list. An exact match wins (Req 14.5); otherwise the first entry whose
 * collapsed form equals the token's collapsed form (Req 11.1, 11.5, 14.6).
 * Returns `null` for a token that matches neither (Req 11.3, 14.3).
 */
export function lookupReporter(token: string): string | null {
  const at = exactIndex.get(token) ?? collapsedIndex.get(collapseReporter(token));
  return at === undefined ? null : (REPORTERS[at] ?? null);
}

/** The Reporter_List entries that end in `.`, in list order (Req 8.6). */
export const REPORTER_ABBREVIATIONS: readonly string[] = REPORTERS.filter((r) => r.endsWith("."));

/**
 * The full Legal_Abbreviation index: the non-reporter list plus every
 * reporter abbreviation that ends in `.` (Glossary Legal_Abbreviation, design
 * A8). The Segmenter uses it, so no Sentence boundary follows `U.S.` or
 * `So.` in prose (Req 8.6).
 */
export const LEGAL_ABBREVIATION_INDEX: AbbreviationIndex =
  buildAbbreviationIndex(REPORTER_ABBREVIATIONS);
