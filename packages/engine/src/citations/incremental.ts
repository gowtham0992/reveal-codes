/**
 * Incremental re-extraction of the citation match layer (design A5 layer 1;
 * Req 15.1, 21.1).
 *
 * `rescan(prev, edit, newText)` returns exactly `scanRange(newText, 0, never)`
 * when `prev` is `scanRange(oldText, 0, never)` and `edit` says that the old
 * Text's range `[from, oldTo)` became `[from, newTo)` of `newText`. Only the
 * match layer is incremental; linking and quotes are recomputed in full by
 * the caller from the returned matches (A5).
 *
 * Landing positions. The old scan's cursor visited exactly the positions in
 * `[0, oldLength)` that no old match strictly contains, so they are read off
 * `prev` by binary search.
 *
 * 1. Left resync point `s`: the largest old landing position with
 *    `s ≤ from − LOOKAHEAD − 1`, or 0. Old matches with `end ≤ s` are kept.
 * 2. Scan `newText` from `s`; the first cursor position `p` with
 *    `p ≥ newTo + LOOKBEHIND` for which `p − delta` is an old landing
 *    position is the right resync point `q` (end of text if none).
 * 3. Result: kept matches, the new matches in `[s, q)`, then the old matches
 *    with `start ≥ q − delta` shifted by `delta`.
 *
 * `matchAt(p)` reads only `[p − LOOKBEHIND, p + LOOKAHEAD)`, so decisions
 * left of `s` read only text before `from`, and decisions from `q` read only
 * text after `newTo`, which is the old text shifted (A5, "Why the result
 * equals full extraction").
 *
 * An `edit` that is not consistent with `newText` (non-integer, out of
 * order, or implying a negative old length) falls back to a full scan, which
 * is always correct for the new Text. Nothing here throws.
 */

import type { Edit } from "../anchor.js";
import { LOOKAHEAD, LOOKBEHIND, scanRange, type Match } from "./scan.js";

const never = (): boolean => false;

/** Index of the first match with `start > x`, or `matches.length`. */
function firstStartAfter(matches: readonly Match[], x: number): number {
  let lo = 0;
  let hi = matches.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((matches[mid] as Match).start > x) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** The old match strictly containing `x`, or null. */
function containing(matches: readonly Match[], x: number): Match | null {
  const i = firstStartAfter(matches, x) - 1;
  const m = i >= 0 ? matches[i] : undefined;
  return m !== undefined && m.start < x && x < m.end ? m : null;
}

/** True when the old scan's cursor visited `x` (A5 "Landing positions"). */
function isLanding(matches: readonly Match[], x: number, oldLength: number): boolean {
  return x >= 0 && x < oldLength && containing(matches, x) === null;
}

/** The largest old landing position at or before `x`, or 0 (A5 step 1). */
function leftResync(matches: readonly Match[], x: number): number {
  if (x <= 0) return 0;
  return containing(matches, x)?.start ?? x;
}

/** True when `edit` describes a range of `newText` and a valid old Text. */
function isConsistent(edit: Edit, newLength: number): boolean {
  const { from, oldTo, newTo } = edit;
  const ints = Number.isInteger(from) && Number.isInteger(oldTo) && Number.isInteger(newTo);
  const oldLength = newLength - (newTo - oldTo);
  return (
    ints && from >= 0 && from <= oldTo && from <= newTo && newTo <= newLength && oldTo <= oldLength
  );
}

/** The old matches with `start ≥ x`, shifted by `delta`. */
function shiftedFrom(matches: readonly Match[], x: number, delta: number): Match[] {
  const out: Match[] = [];
  for (let i = firstStartAfter(matches, x - 1); i < matches.length; i += 1) {
    const m = matches[i] as Match;
    out.push({ ...m, start: m.start + delta, end: m.end + delta });
  }
  return out;
}

/**
 * The match list of `newText`, recomputed only inside the A5 window.
 * `prev` must be the full match list of the old Text.
 */
export function rescan(prev: readonly Match[], edit: Edit, newText: string): readonly Match[] {
  if (!isConsistent(edit, newText.length)) return scanRange(newText, 0, never);
  const delta = edit.newTo - edit.oldTo;
  const oldLength = newText.length - delta;
  const s = leftResync(prev, edit.from - LOOKAHEAD - 1);
  const rightFloor = edit.newTo + LOOKBEHIND;
  let q = newText.length;
  const until = (p: number): boolean => {
    if (p < rightFloor || !isLanding(prev, p - delta, oldLength)) return false;
    q = p;
    return true;
  };
  const fresh = scanRange(newText, s, until);
  const kept = prev.slice(0, firstStartAfter(prev, s - 1));
  return [...kept, ...fresh, ...shiftedFrom(prev, q - delta, delta)];
}
