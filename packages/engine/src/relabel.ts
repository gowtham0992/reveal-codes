/**
 * Run table accounting and AI>HUM relabelling (design A3 steps 3 to 5;
 * Req 4.8, 4.9, 6.1-6.4, 6.7, 6.8, 6.12). Counting and relabelling are
 * separate so that Replace can apply both counts and then relabel once
 * (design A4, Req 6.9). Pure functions over plain data; inputs are never
 * mutated, and a function that changes nothing returns its input array.
 */
import type { InvalidSpans } from "./errors.js";
import { ok, type Result } from "./result.js";
import { normaliseSpans, runExtents } from "./spans.js";
import type { Origin, Provenance, RunEntry, Span } from "./types.js";

/** Spans and Run table after `relabelRuns`; `relabelled` lists the Run_Ids it flipped, in table order. */
export type RelabelResult = Readonly<{
  spans: readonly Span[];
  runs: readonly RunEntry[];
  relabelled: readonly string[];
}>;

/** Index of `runId` in `runs` (sorted by runId, code unit order), or its insertion point as `-(point + 1)`. */
function searchRun(runs: readonly RunEntry[], runId: string): number {
  let lo = 0;
  let hi = runs.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const run = runs[mid];
    if (run === undefined) break;
    if (run.runId === runId) return mid;
    if (run.runId < runId) lo = mid + 1;
    else hi = mid - 1;
  }
  return -(lo + 1);
}

/**
 * Design A3 step 3 (Req 4.8, 4.9). For a caller provenance with Origin `AI`
 * and Run_Id `r`, adds `length` to the Original_Length of `r`, creating
 * `{ r, length, 0, false }` in sorted position if absent. Pass the caller's
 * provenance, not the effective one: an `AI` insert into a relabelled Run
 * still counts (Req 6.11). Any other Origin, or `length` 0, changes nothing.
 */
export function addOriginalLength(
  runs: readonly RunEntry[],
  provenance: Provenance,
  length: number,
): readonly RunEntry[] {
  const runId = provenance.runId;
  if (provenance.origin !== "AI" || runId === undefined || length <= 0) return runs;
  const i = searchRun(runs, runId);
  const out = runs.slice();
  const found = runs[i];
  if (i >= 0 && found !== undefined) {
    out[i] = { ...found, originalLength: found.originalLength + length };
  } else {
    out.splice(-i - 1, 0, { runId, originalLength: length, editedCount: 0, relabelled: false });
  }
  return out;
}

/** Adds each Run_Id's amount to its entry's editedCount; Run_Ids absent from the table are skipped. */
function addEdited(
  runs: readonly RunEntry[],
  amounts: ReadonlyMap<string, number>,
): readonly RunEntry[] {
  let out: RunEntry[] | null = null;
  for (const [runId, amount] of amounts) {
    const i = searchRun(runs, runId);
    const found = runs[i];
    if (i < 0 || found === undefined || amount <= 0) continue;
    out ??= runs.slice();
    out[i] = { ...found, editedCount: found.editedCount + amount };
  }
  return out ?? runs;
}

/**
 * Design A3 step 4 for deletions (Req 6.1, 6.7). With Actor `HUM`, adds to
 * each Run's editedCount the code units of `deletedPieces` (from
 * `spliceSpans`) that have Origin `AI` and that Run's Run_Id. Pieces of any
 * other Origin add nothing. Actors `PST` and `AI` change nothing.
 */
export function countDeleted(
  runs: readonly RunEntry[],
  actor: Origin,
  deletedPieces: readonly Span[],
): readonly RunEntry[] {
  if (actor !== "HUM") return runs;
  const amounts = new Map<string, number>();
  for (const piece of deletedPieces) {
    const runId = piece.provenance.runId;
    if (piece.provenance.origin !== "AI" || runId === undefined) continue;
    amounts.set(runId, (amounts.get(runId) ?? 0) + (piece.end - piece.start));
  }
  return addEdited(runs, amounts);
}

/**
 * Design A3 step 4 for insertions (Req 6.2, 6.7). With Actor `HUM`, adds
 * `length` to the editedCount of every Run whose Run_Extent in
 * `spansBefore` (the spans before the insertion) satisfies
 * `runStart < at < runEnd`. An insertion at either end of an extent adds
 * nothing. Actors `PST` and `AI`, and `length` 0, change nothing.
 */
export function countInserted(
  runs: readonly RunEntry[],
  actor: Origin,
  spansBefore: readonly Span[],
  at: number,
  length: number,
): readonly RunEntry[] {
  if (actor !== "HUM" || length <= 0) return runs;
  const amounts = new Map<string, number>();
  for (const [runId, [start, end]] of runExtents(spansBefore)) {
    if (start < at && at < end) amounts.set(runId, length);
  }
  return addEdited(runs, amounts);
}

/** Whether an unflagged entry's Edited_Proportion is strictly above `threshold` (Req 6.3, 6.4). */
const crosses = (run: RunEntry, threshold: number): boolean =>
  !run.relabelled && run.editedCount / run.originalLength > threshold;

/** Rewrites the `AI` spans of the listed Runs to `AI>HUM`, keeping Run_Id, Timestamp, and Offsets. */
function relabelSpans(spans: readonly Span[], runIds: ReadonlySet<string>): readonly Span[] {
  return spans.map((span) => {
    const { origin, runId, timestamp } = span.provenance;
    if (origin !== "AI" || runId === undefined || !runIds.has(runId)) return span;
    return { start: span.start, end: span.end, provenance: { origin: "AI>HUM", runId, timestamp } };
  });
}

/**
 * Design A3 step 5 (Req 6.3, 6.4, 6.8, 6.12). Every Run whose flag is false
 * and whose editedCount / originalLength is strictly greater than
 * `threshold` gets `relabelled: true`, and all its `AI` spans become
 * `AI>HUM`. Flags are never cleared. Only when some Run flips are the spans
 * fully normalised, merging any newly Mergeable neighbours (Req 3.3);
 * otherwise `spans` and `runs` are returned unchanged. The error case
 * reports a non-canonical input span list and cannot occur for spans from
 * `spliceSpans`.
 */
export function relabelRuns(
  spans: readonly Span[],
  runs: readonly RunEntry[],
  threshold: number,
): Result<RelabelResult, InvalidSpans> {
  const flipped = runs.filter((run) => crosses(run, threshold)).map((run) => run.runId);
  if (flipped.length === 0) return ok({ spans, runs, relabelled: flipped });
  const set = new Set(flipped);
  const newRuns = runs.map((run) => (set.has(run.runId) ? { ...run, relabelled: true } : run));
  const textLength = spans[spans.length - 1]?.end ?? 0;
  const normalised = normaliseSpans(textLength, relabelSpans(spans, set));
  if (!normalised.ok) return normalised;
  return ok({ spans: normalised.value, runs: newRuns, relabelled: flipped });
}
