/**
 * The citation match layer (design A9 overall, A5 layer 1; Req 9.1, 9.7, 9.8).
 *
 * `matchAt(text, p)` checks the Req 9.8 word boundary first, then tries the
 * classes in order and returns the first that succeeds:
 *
 * 1. Database_Citation (`matchDatabaseAt`, A9 step 2).
 * 2. Reporter or Parallel_Citation (`matchReporterAt`, A9 step 3; it already
 *    takes the longest reading, so a parallel beats its first member).
 * 3. Short_Form (`matchShortAt`, A9 step 4; `Id.` and the party form are one
 *    class and the longer wins, D16).
 * 4. Other_Reference (`matchOtherAt`, A9 step 5), accepted only if no
 *    database or reporter match starts at any `q` in `(p, end)`, so a
 *    Full_Citation takes precedence over an Other_Reference (Req 9.7).
 *
 * A failed boundary (a letter or number directly before `p`) rules out
 * classes 1, 2, and 4. The Short_Form class has its own, stricter left
 * context (whitespace or an opener for `Id.`, a non-word code unit for the
 * party form), so it is still tried; this is the only exception A9 step 1
 * allows.
 *
 * Locality. `matchAt` runs the matchers on `text.slice(p − LOOKBEHIND,
 * p + LOOKAHEAD)` and shifts the result back, so every read lies in
 * `[p − LOOKBEHIND, p + LOOKAHEAD)` by construction, which is what the
 * rescan proof in A5 relies on. The matchers' own bounds (each module's
 * header) are well inside the window, so the slice never changes a result.
 * A match longer than `MAX_MATCH` is discarded, so the bound the rescan's
 * termination argument uses holds even if a grammar bound were wrong.
 *
 * `scanRange` moves a leftmost-longest cursor: on a match it jumps to the
 * match's end, otherwise it steps one code unit, so matches never overlap.
 *
 * Normalised_Form is not set here; `extract` computes it (A9). Nothing here
 * throws.
 */

import type { CitationValue } from "../types.js";
import { matchDatabaseAt } from "./grammar-db.js";
import { matchOtherAt } from "./grammar-other.js";
import { matchShortAt } from "./grammar-short.js";
import { matchReporterAt } from "./grammar.js";
import { isWordCharBefore } from "./lex.js";
import { PARTY_SCAN } from "./party.js";

/** One citation match: `[start, end)` and its value (Short_Form `targetStart` unset). */
export type Match = Readonly<{
  start: number;
  end: number;
  value: CitationValue;
  normalised?: string;
}>;

/** Upper bound on any match length (design Constants). */
export const MAX_MATCH = 512;
/** How far `matchAt(p)` may read forward, the Other_Reference look-ahead included. */
export const LOOKAHEAD = 2 * MAX_MATCH;
/** How far `matchAt(p)` may read behind `p`: `PARTY_SCAN + 1` = 162. */
export const LOOKBEHIND = PARTY_SCAN + 1;

type Local = Readonly<{ start: number; end: number; value: CitationValue }>;

/** Keeps a match only when it is non-empty and at most `MAX_MATCH` long. */
function capped(m: Local | null): Local | null {
  return m !== null && m.end > m.start && m.end - m.start <= MAX_MATCH ? m : null;
}

/** A database or reporter match at `q` (the Full_Citation classes, in order). */
function fullAt(w: string, q: number): Local | null {
  return capped(matchDatabaseAt(w, q)) ?? capped(matchReporterAt(w, q));
}

/** True when a Full_Citation match starts at some `q` in `(m.start, m.end)`. */
function fullStartsInside(w: string, m: Local): boolean {
  for (let q = m.start + 1; q < m.end; q += 1) {
    if (fullAt(w, q) !== null) return true;
  }
  return false;
}

/** The Other_Reference class at `q`, with the Full_Citation precedence look-ahead. */
function otherAt(w: string, q: number): Local | null {
  const m = capped(matchOtherAt(w, q));
  return m === null || fullStartsInside(w, m) ? null : m;
}

/** The class order of A9 at `q` in the window `w`. */
function matchInWindow(w: string, q: number): Local | null {
  const bounded = !isWordCharBefore(w, q);
  if (bounded) {
    const full = fullAt(w, q);
    if (full !== null) return full;
  }
  const short = capped(matchShortAt(w, q));
  if (short !== null) return short;
  return bounded ? otherAt(w, q) : null;
}

/**
 * The citation match that starts exactly at `p`, or null. Reads only
 * `text[p − LOOKBEHIND .. p + LOOKAHEAD)`. Any `p` outside `[0, text.length)`
 * or not an integer yields null.
 */
export function matchAt(text: string, p: number): Match | null {
  if (!Number.isInteger(p) || p < 0 || p >= text.length) return null;
  const lo = Math.max(0, p - LOOKBEHIND);
  const w = text.slice(lo, p + LOOKAHEAD);
  const m = matchInWindow(w, p - lo);
  return m === null ? null : { start: m.start + lo, end: m.end + lo, value: m.value };
}

/**
 * Scans from the cursor position `from` and returns the matches in order.
 * Before each step the cursor position `p` is passed to `until`; the scan
 * stops when it returns true or the cursor reaches the end of the Text. A
 * match moves the cursor to its end, a miss moves it by one code unit, so
 * the result is leftmost-longest and non-overlapping (Req 9.1, 9.7).
 * A `from` that is not a non-negative integer starts the scan at 0.
 */
export function scanRange(
  text: string,
  from: number,
  until: (p: number) => boolean,
): readonly Match[] {
  const out: Match[] = [];
  let p = Number.isInteger(from) && from > 0 ? from : 0;
  while (p < text.length && !until(p)) {
    const m = matchAt(text, p);
    if (m === null) {
      p += 1;
    } else {
      out.push(m);
      p = m.end;
    }
  }
  return out;
}
