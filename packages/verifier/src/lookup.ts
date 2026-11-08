import type { CitationRecord, IssueKey, VerificationResult } from "@reveal-codes/engine";
import { acquire } from "./bucket";
import { cacheGet, cacheSet } from "./cache-access";
import { chunkLines } from "./chunk";
import type { Chunk } from "./chunk";
import { combineParallel } from "./combine";
import type { Deps } from "./deps";
import { buildLines } from "./lines";
import type { LineIndex } from "./lines";
import { mapChunk, parseLookupBody } from "./map-status";
import { buildLookupRequest } from "./request";
import { nowMs } from "./time";
import { requestOnce, waitUntilOf, withRetries } from "./transport";
import { withGate } from "./gate";

export type LookupPlan = Readonly<{
  /** Unique Citation_Lines, first-occurrence order. */
  lines: readonly string[];
  /** The lines in request-sized chunks (A2). */
  chunks: readonly Chunk[];
  /** Per Full_Record: member lines, or "database" / "invalid". */
  index: LineIndex;
}>;

export type CombineParallel = (members: readonly VerificationResult[]) => VerificationResult;

const UNCHECKED: VerificationResult = { status: "unchecked" };

/**
 * Pure planning step of `lookup` (A1 steps 1 to 4, before the cache): which
 * lines would be sent and how they are chunked. Short and other records are
 * never read past their `kind`.
 */
export function planLookup(records: readonly CitationRecord[]): LookupPlan {
  const index = buildLines(records);
  return { lines: index.lines, chunks: chunkLines(index.lines), index };
}

/**
 * One result per Full_Record (A1 step 6). Database and invalid records give a
 * bare `unchecked`; one member gives its result; several are combined by
 * `combine` (`combineParallel`, wired in task 4.4). A line with no result is `unchecked`.
 */
export function resultsForRecords(
  index: LineIndex,
  lineResults: ReadonlyMap<string, VerificationResult>,
  combine: CombineParallel,
): ReadonlyMap<IssueKey, VerificationResult> {
  const out = new Map<IssueKey, VerificationResult>();
  for (const [key, members] of index.members) {
    if (typeof members === "string") {
      out.set(key, UNCHECKED);
      continue;
    }
    const results = members.map((line) => lineResults.get(line) ?? UNCHECKED);
    const [only] = results;
    out.set(key, results.length === 1 && only !== undefined ? only : combine(results));
  }
  return out;
}

type LineResults = Map<string, VerificationResult>;

function uncheckedLines(lines: readonly string[], waitUntil: string | null): LineResults {
  const r: VerificationResult = waitUntil === null ? UNCHECKED : { status: "unchecked", waitUntil };
  return new Map(lines.map((line) => [line, r]));
}

/** One chunk through the bucket, the retry loop and the status mapping (A3). */
async function dispatchChunk(deps: Deps, chunk: Chunk): Promise<LineResults> {
  const { lines } = chunk;
  if (chunk.oversize) return uncheckedLines(lines, null);
  const req = buildLookupRequest(deps, lines);
  const { outcome } = await withRetries(
    deps,
    () => acquire(deps, lines.length),
    () => requestOnce(deps, req.url, req.spec),
  );
  if (outcome.kind === "json") {
    return new Map(mapChunk(lines, parseLookupBody(outcome.json), null, nowMs(deps)));
  }
  return uncheckedLines(lines, waitUntilOf(outcome, nowMs(deps)));
}

/** A chunk that fails for any reason leaves only its own lines `unchecked` (Req 1.9, 1.10). */
function dispatchIsolated(deps: Deps, chunk: Chunk): Promise<LineResults> {
  return dispatchChunk(deps, chunk).then(
    (r) => r,
    () => uncheckedLines(chunk.lines, null),
  );
}

async function dispatchAll(deps: Deps, chunks: readonly Chunk[], into: LineResults): Promise<void> {
  for (const chunk of chunks) {
    const got = await dispatchIsolated(deps, chunk);
    for (const [line, result] of got) {
      into.set(line, result);
      await cacheSet(deps, line, result);
    }
  }
}

/** Cache read before the gate (A1 step 3). Returns the lines still to be requested. */
async function readCache(
  deps: Deps,
  lines: readonly string[],
  into: LineResults,
): Promise<string[]> {
  const missing: string[] = [];
  for (const line of lines) {
    const hit = await cacheGet(deps, line);
    if (hit === undefined) missing.push(line);
    else into.set(line, hit);
  }
  return missing;
}

/**
 * One result per Full_Record, keyed by the record's key (Req 1.1, 1.5). Never throws
 * or rejects: every failure becomes `unchecked` for the affected records.
 */
export async function lookup(
  records: readonly CitationRecord[],
  deps: Deps,
): Promise<ReadonlyMap<IssueKey, VerificationResult>> {
  if (!records.some((r) => r.kind === "full")) return new Map();
  const plan = planLookup(records);
  const results: LineResults = new Map();
  const missing = await readCache(deps, plan.lines, results);
  if (missing.length > 0) {
    const chunks = chunkLines(missing);
    await withGate(deps.state, () => dispatchAll(deps, chunks, results));
  }
  return resultsForRecords(plan.index, results, combineParallel);
}
