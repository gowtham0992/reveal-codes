/**
 * Text and span splicing for one primitive edit `[from, to) -> inserted`
 * (design A3 steps 1, 2, and 6; Req 4.1-4.5, 4.11, 4.12, 6.11). Pure
 * functions over plain data; inputs are never mutated. Callers validate
 * offsets first (ops/validate.ts), so every offset here is a Valid_Boundary.
 */
import { mergeSeams, spanIndexAt } from "../spans.js";
import type { Provenance, RunEntry, Span } from "../types.js";

/** New spans after a splice, and the old pieces inside [from, to) at their old offsets. */
export type SpliceResult = Readonly<{ spans: readonly Span[]; deletedPieces: readonly Span[] }>;

/** Design A3 step 6: `text.slice(0, from) + inserted + text.slice(to)`. */
export function spliceText(text: string, from: number, to: number, inserted: string): string {
  return text.slice(0, from) + inserted + text.slice(to);
}

/** Run table entry for `runId` by binary search; `runs` is sorted by runId (code unit order). */
function findRun(runs: readonly RunEntry[], runId: string): RunEntry | undefined {
  let lo = 0;
  let hi = runs.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const run = runs[mid];
    if (run === undefined) return undefined;
    if (run.runId === runId) return run;
    if (run.runId < runId) lo = mid + 1;
    else hi = mid - 1;
  }
  return undefined;
}

/**
 * Design A3 step 1 (Req 6.11): an `AI` provenance whose Run is relabelled
 * becomes `AI>HUM` with the same Run_Id and Timestamp. Anything else is
 * returned unchanged (the same object).
 */
export function effectiveProvenance(provenance: Provenance, runs: readonly RunEntry[]): Provenance {
  if (provenance.origin !== "AI" || provenance.runId === undefined) return provenance;
  const run = findRun(runs, provenance.runId);
  if (run === undefined || !run.relabelled) return provenance;
  return { origin: "AI>HUM", runId: provenance.runId, timestamp: provenance.timestamp };
}

const mkSpan = (start: number, end: number, provenance: Provenance): Span => ({
  start,
  end,
  provenance,
});

/** Index of the span covering code unit `offset`, or `spans.length` when none does (end of text). */
function indexFrom(spans: readonly Span[], offset: number): number {
  const i = spanIndexAt(spans, offset);
  return i === -1 ? spans.length : i;
}

/** Old spans left of `from`, cutting the span that straddles it. */
function leftPieces(spans: readonly Span[], i: number, from: number): Span[] {
  const out = spans.slice(0, i);
  const cut = spans[i];
  if (cut !== undefined && cut.start < from) out.push(mkSpan(cut.start, from, cut.provenance));
  return out;
}

/** Old spans right of `to`, cutting the span that straddles it, shifted by `delta`. */
function rightPieces(spans: readonly Span[], k: number, to: number, delta: number): Span[] {
  const out: Span[] = [];
  const cut = spans[k];
  if (cut !== undefined)
    out.push(mkSpan(Math.max(cut.start, to) + delta, cut.end + delta, cut.provenance));
  for (let idx = k + 1; idx < spans.length; idx += 1) {
    const s = spans[idx];
    if (s !== undefined)
      out.push(delta === 0 ? s : mkSpan(s.start + delta, s.end + delta, s.provenance));
  }
  return out;
}

/** Old pieces inside [from, to), clipped, at their old offsets, in Offset order. */
function deletedBetween(spans: readonly Span[], i: number, from: number, to: number): Span[] {
  const out: Span[] = [];
  for (let idx = i; idx < spans.length; idx += 1) {
    const s = spans[idx];
    if (s === undefined || s.start >= to) break;
    out.push(mkSpan(Math.max(s.start, from), Math.min(s.end, to), s.provenance));
  }
  return out;
}

/**
 * Design A3 step 2. Replaces [from, to) of a canonical span list with
 * `piece` (already placed at [from, from + length), or null for a pure
 * delete), keeping every outside piece's Provenance_Record and shifting the
 * right pieces. Merging runs only at the seams around the edit, so a cut,
 * the new piece, and a cut can join into one span that keeps the left cut's
 * Timestamp (Req 4.11, 4.12). The caller passes the effective provenance.
 */
export function spliceSpans(
  spans: readonly Span[],
  from: number,
  to: number,
  piece: Span | null,
): SpliceResult {
  const inserted = piece === null ? 0 : piece.end - piece.start;
  const i = indexFrom(spans, from);
  const left = leftPieces(spans, i, from);
  const right = rightPieces(spans, indexFrom(spans, to), to, inserted - (to - from));
  const middle = piece === null || inserted === 0 ? [] : [piece];
  const seams = [left.length, left.length + middle.length];
  const deletedPieces = from < to ? deletedBetween(spans, i, from, to) : [];
  return { spans: mergeSeams([...left, ...middle, ...right], seams), deletedPieces };
}
