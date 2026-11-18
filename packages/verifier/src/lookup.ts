import type { CitationRecord, IssueKey, VerificationResult } from "@reveal-codes/engine";
import { acquire } from "./bucket";
import { cacheGet, cachePeek, cacheSet, isCachedLine } from "./cache-access";
import { clusterDataByIndex } from "./clusters";
import type { ClusterData } from "./clusters";
import { judgeRecords } from "./judge";
import type { DisplayInfo } from "./judge";
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
type ClusterMap = Map<string, ClusterData>;
type Fetched = Readonly<{ results: LineResults; clusters: ClusterMap }>;

function uncheckedLines(lines: readonly string[], waitUntil: string | null): Fetched {
  const r: VerificationResult = waitUntil === null ? UNCHECKED : { status: "unchecked", waitUntil };
  return { results: new Map(lines.map((line) => [line, r])), clusters: new Map() };
}

function fetchedFrom(lines: readonly string[], json: unknown, nowMillis: number): Fetched {
  const results: LineResults = new Map(mapChunk(lines, parseLookupBody(json), null, nowMillis));
  const data = clusterDataByIndex(json);
  const clusters: ClusterMap = new Map();
  lines.forEach((line, i) => {
    const d = data.get(i);
    if (d !== undefined && results.get(line)?.status === "verified") clusters.set(line, d);
  });
  return { results, clusters };
}

/** One chunk through the bucket, the retry loop and the status mapping (A3). */
async function dispatchChunk(deps: Deps, chunk: Chunk): Promise<Fetched> {
  const { lines } = chunk;
  if (chunk.oversize) return uncheckedLines(lines, null);
  const req = buildLookupRequest(deps, lines);
  const { outcome } = await withRetries(
    deps,
    () => acquire(deps, lines.length),
    () => requestOnce(deps, req.url, req.spec),
  );
  if (outcome.kind === "json") return fetchedFrom(lines, outcome.json, nowMs(deps));
  return uncheckedLines(lines, waitUntilOf(outcome, nowMs(deps)));
}

/** A chunk that fails for any reason leaves only its own lines `unchecked` (Req 1.9, 1.10). */
function dispatchIsolated(deps: Deps, chunk: Chunk): Promise<Fetched> {
  return dispatchChunk(deps, chunk).then(
    (r) => r,
    () => uncheckedLines(chunk.lines, null),
  );
}

async function dispatchAll(
  deps: Deps,
  chunks: readonly Chunk[],
  into: LineResults,
  clusters: ClusterMap,
): Promise<void> {
  for (const chunk of chunks) {
    const got = await dispatchIsolated(deps, chunk);
    for (const [line, result] of got.results) {
      into.set(line, result);
      const cluster = got.clusters.get(line);
      if (cluster !== undefined) clusters.set(line, cluster);
      const cached = result.status === "verified" ? { ...result, cluster: cluster ?? {} } : result;
      await cacheSet(deps, line, cached);
    }
  }
}

/** Cache read before the gate (A1 step 3). Returns the lines still to be requested. */
async function readCache(
  deps: Deps,
  lines: readonly string[],
  into: LineResults,
  clusters: ClusterMap,
): Promise<string[]> {
  const missing: string[] = [];
  for (const line of lines) {
    const hit = await cacheGet(deps, line, isCachedLine);
    if (hit === undefined) {
      missing.push(line);
    } else if (hit.status === "verified") {
      into.set(line, { status: "verified", clusterId: hit.clusterId });
      clusters.set(line, hit.cluster);
    } else {
      into.set(line, hit);
    }
  }
  return missing;
}

export type LookupInfo = Readonly<{
  results: ReadonlyMap<IssueKey, VerificationResult>;
  info: ReadonlyMap<IssueKey, DisplayInfo>;
}>;

/**
 * One result per Full_Record, keyed by the record's key (Req 1.1, 1.5), with the case-name
 * comparison applied, plus the Display_Info of every resolved citation. Never throws or
 * rejects: every failure becomes `unchecked` for the affected records.
 */
export async function lookupWithInfo(
  records: readonly CitationRecord[],
  deps: Deps,
): Promise<LookupInfo> {
  if (!records.some((r) => r.kind === "full")) return { results: new Map(), info: new Map() };
  const plan = planLookup(records);
  const lineResults: LineResults = new Map();
  const clusters: ClusterMap = new Map();
  const missing = await readCache(deps, plan.lines, lineResults, clusters);
  if (missing.length > 0) {
    const chunks = chunkLines(missing);
    await withGate(deps.state, () => dispatchAll(deps, chunks, lineResults, clusters));
  }
  const combined = resultsForRecords(plan.index, lineResults, combineParallel);
  return judgeRecords(records, plan.index, combined, lineResults, clusters);
}

/**
 * The Citation_Lines of `records` that `lookupWithInfo` would send to the service: those with
 * no valid cached entry. Read-only: no cache write, no counter change, no `fetch`.
 */
export async function missingLines(
  records: readonly CitationRecord[],
  deps: Deps,
): Promise<readonly string[]> {
  const missing: string[] = [];
  for (const line of planLookup(records).lines) {
    if ((await cachePeek(deps, line, isCachedLine)) === undefined) missing.push(line);
  }
  return missing;
}

/** `lookupWithInfo` without the Display_Info; the comparison still applies. */
export function lookup(
  records: readonly CitationRecord[],
  deps: Deps,
): Promise<ReadonlyMap<IssueKey, VerificationResult>> {
  return lookupWithInfo(records, deps).then((o) => o.results);
}
