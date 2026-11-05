/**
 * Span lists: the Coverage_Invariant check, canonical normalisation, seam
 * merging for the splice path, and lookups (design A3 step 2, Req 3).
 * Pure functions over plain data; inputs are never mutated.
 */
import type { InvalidSpans, SpanViolation } from "./errors.js";
import { err, ok, type Result } from "./result.js";
import type { Origin, Provenance, Span } from "./types.js";

const hasRunId = (p: Provenance): boolean => Object.prototype.hasOwnProperty.call(p, "runId");

/**
 * Mergeable (Glossary): equal Origins, and Run_Ids equal or both absent.
 * Timestamps are ignored (Req 3.3).
 */
export function isMergeable(a: Provenance, b: Provenance): boolean {
  if (a.origin !== b.origin) return false;
  if (hasRunId(a) !== hasRunId(b)) return false;
  return a.runId === b.runId;
}

const violation = (offset: number, kind: SpanViolation): Result<never, InvalidSpans> =>
  err({ kind: "invalid_spans", offset, violation: kind });

const isOffset = (n: number): boolean => Number.isInteger(n) && n >= 0;

/**
 * Checks one span against the running coverage cursor (the end of the
 * previous span, or 0). Checks run in this order: malformed bounds or past
 * the end (`coverage`), empty (`empty`), start before the previous start
 * (`unsorted`), start before the cursor (`overlap`), start after the cursor
 * (`gap`, reported at the cursor, where the uncovered range begins).
 */
function checkOne(
  span: Span,
  prevStart: number,
  cursor: number,
  textLength: number,
): Result<void, InvalidSpans> {
  if (!isOffset(span.start) || !Number.isInteger(span.end)) return violation(cursor, "coverage");
  if (span.end <= span.start) return violation(span.start, "empty");
  if (span.start < prevStart) return violation(span.start, "unsorted");
  if (span.start < cursor) return violation(span.start, "overlap");
  if (span.start > cursor) return violation(cursor, "gap");
  if (span.end > textLength) return violation(textLength, "coverage");
  return ok(undefined);
}

/**
 * Coverage_Invariant (Req 3.1, 3.6): spans are non-empty, sorted by start,
 * pairwise non-overlapping, and cover [0, textLength) with no gaps. Scans
 * left to right and returns `invalid_spans` for the first span that breaks
 * a rule (see `checkOne`), or `coverage` at the cursor if the spans end
 * before `textLength`. An empty list is valid only for `textLength` 0.
 */
export function checkCoverage(
  textLength: number,
  spans: readonly Span[],
): Result<void, InvalidSpans> {
  if (!isOffset(textLength)) return violation(0, "coverage");
  let cursor = 0;
  let prevStart = 0;
  for (const span of spans) {
    const checked = checkOne(span, prevStart, cursor, textLength);
    if (!checked.ok) return checked;
    prevStart = span.start;
    cursor = span.end;
  }
  if (cursor !== textLength) return violation(cursor, "coverage");
  return ok(undefined);
}

/** Extends `last` to the end of `next`, keeping `last`'s (lowest-start) Provenance. */
const extend = (last: Span, next: Span): Span => ({
  start: last.start,
  end: next.end,
  provenance: last.provenance,
});

/**
 * Merges every maximal run of adjacent Mergeable spans into one span that
 * keeps the Provenance_Record, and so the Timestamp, of its lowest-start
 * member (Req 3.3, 3.5). Assumes the Coverage_Invariant holds.
 */
function mergeAll(spans: readonly Span[]): readonly Span[] {
  const out: Span[] = [];
  for (const span of spans) {
    const last = out[out.length - 1];
    if (last !== undefined && isMergeable(last.provenance, span.provenance)) {
      out[out.length - 1] = extend(last, span);
    } else {
      out.push(span);
    }
  }
  return out;
}

/**
 * Normalisation (Req 3.3–3.7): validates the Coverage_Invariant, then merges
 * Mergeable runs. The result is canonical, so normalising it again returns
 * an equal list (Req 3.4), and two fragmentations of one labelling give the
 * same starts, ends, Origins, and Run_Ids (Req 3.7).
 */
export function normaliseSpans(
  textLength: number,
  spans: readonly Span[],
): Result<readonly Span[], InvalidSpans> {
  const checked = checkCoverage(textLength, spans);
  if (!checked.ok) return checked;
  return ok(mergeAll(spans));
}

/**
 * Merges only at the listed seams (design A3 step 2). Seam `s` is the
 * boundary between `spans[s - 1]` and `spans[s]`; seams outside
 * [1, spans.length) are ignored. Adjacent listed seams chain, so a cut, a new
 * piece, and a cut can merge into one span (Req 4.12). Each merged span keeps
 * its lowest-start member's Provenance_Record. Assumes the spans are
 * contiguous and that only the listed seams can join Mergeable neighbours.
 */
export function mergeSeams(spans: readonly Span[], seams: readonly number[]): readonly Span[] {
  const wanted = seams.filter((s) => Number.isInteger(s) && s >= 1 && s < spans.length);
  if (wanted.length === 0) return spans;
  const seamSet = new Set(wanted);
  const out: Span[] = [];
  spans.forEach((span, i) => {
    const last = out[out.length - 1];
    if (last !== undefined && seamSet.has(i) && isMergeable(last.provenance, span.provenance)) {
      out[out.length - 1] = extend(last, span);
    } else {
      out.push(span);
    }
  });
  return out;
}

/**
 * Index of the span covering code unit `offset` (start ≤ offset < end) in a
 * list satisfying the Coverage_Invariant, by binary search; -1 if none.
 */
export function spanIndexAt(spans: readonly Span[], offset: number): number {
  let lo = 0;
  let hi = spans.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const span = spans[mid];
    if (span === undefined) return -1;
    if (offset < span.start) hi = mid - 1;
    else if (offset >= span.end) lo = mid + 1;
    else return mid;
  }
  return -1;
}

/** Origin covering code unit `offset`, or null when no span covers it. */
export function originAt(spans: readonly Span[], offset: number): Origin | null {
  const span = spans[spanIndexAt(spans, offset)];
  return span === undefined ? null : span.provenance.origin;
}

/**
 * Run_Extent of every Run with a span in `spans` (Origin `AI` or `AI>HUM`):
 * Run_Id to [start of its first span, end of its last span). Entries appear
 * in order of each Run's first span, so iteration order depends only on the
 * input. O(spans).
 */
export function runExtents(spans: readonly Span[]): ReadonlyMap<string, readonly [number, number]> {
  const extents = new Map<string, readonly [number, number]>();
  for (const span of spans) {
    const runId = span.provenance.runId;
    if (runId === undefined) continue;
    const prev = extents.get(runId);
    extents.set(runId, prev === undefined ? [span.start, span.end] : [prev[0], span.end]);
  }
  return extents;
}
