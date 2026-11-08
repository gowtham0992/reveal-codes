import type { CitationRecord, IssueKey, VerificationResult } from "@reveal-codes/engine";
import { chunkLines } from "./chunk";
import type { Chunk } from "./chunk";
import { buildLines } from "./lines";
import type { LineIndex } from "./lines";

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
