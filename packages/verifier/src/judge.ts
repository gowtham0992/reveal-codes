import type { CitationRecord, IssueKey, VerificationResult } from "@reveal-codes/engine";
import { foundNames, foundYear } from "./clusters";
import type { ClusterData } from "./clusters";
import { isSafeAbsoluteUrl } from "./link";
import type { DisplayInfo } from "./link";
import type { LineIndex } from "./lines";
import { namesMatch } from "./name-match";

export type { DisplayInfo } from "./link";

export type Judged = Readonly<{
  results: ReadonlyMap<IssueKey, VerificationResult>;
  info: ReadonlyMap<IssueKey, DisplayInfo>;
}>;

type FullRecord = Extract<CitationRecord, { kind: "full" }>;

function nonBlank(s: string | undefined): s is string {
  return s !== undefined && s.trim() !== "";
}

/** Data of the first member line whose result is this cluster and that has cluster data. */
function dataFor(
  members: readonly string[],
  clusterId: string,
  lineResults: ReadonlyMap<string, VerificationResult>,
  clusters: ReadonlyMap<string, ClusterData>,
): ClusterData | undefined {
  for (const line of members) {
    const r = lineResults.get(line);
    const data = clusters.get(line);
    if (r?.status === "verified" && r.clusterId === clusterId && data !== undefined) return data;
  }
  return undefined;
}

function infoOf(clusterId: string, name: string, data: ClusterData): DisplayInfo {
  const year = foundYear(data);
  const base = { clusterId, foundName: name };
  const withYear = year === undefined ? base : { ...base, foundYear: year };
  return isSafeAbsoluteUrl(data.absoluteUrl)
    ? { ...withYear, absoluteUrl: data.absoluteUrl }
    : withYear;
}

function judgeOne(
  record: FullRecord,
  clusterId: string,
  data: ClusterData,
): Readonly<{ result: VerificationResult; info?: DisplayInfo }> {
  const verified: VerificationResult = { status: "verified", clusterId };
  const found = data.caseName;
  if (!nonBlank(found)) return { result: verified };
  const info = infoOf(clusterId, found, data);
  const cited = record.citation.caseName;
  if (cited === undefined || namesMatch(cited, foundNames(data))) return { result: verified, info };
  const year = foundYear(data);
  const wrong: VerificationResult =
    year === undefined
      ? { status: "wrong_case", clusterId, foundName: found }
      : { status: "wrong_case", clusterId, foundName: found, foundYear: year };
  return { result: wrong, info };
}

/**
 * Applies the case-name comparison once per Full_Record whose combined result is `verified`.
 * `lineResults` and `clusters` are by Citation_Line. Other statuses pass through unchanged.
 */
export function judgeRecords(
  records: readonly CitationRecord[],
  index: LineIndex,
  results: ReadonlyMap<IssueKey, VerificationResult>,
  lineResults: ReadonlyMap<string, VerificationResult>,
  clusters: ReadonlyMap<string, ClusterData>,
): Judged {
  const out = new Map(results);
  const info = new Map<IssueKey, DisplayInfo>();
  for (const record of records) {
    if (record.kind !== "full") continue;
    const current = results.get(record.key);
    const members = index.members.get(record.key);
    if (current?.status !== "verified" || members === undefined || typeof members === "string")
      continue;
    const data = dataFor(members, current.clusterId, lineResults, clusters);
    if (data === undefined) continue;
    const judged = judgeOne(record, current.clusterId, data);
    out.set(record.key, judged.result);
    if (judged.info !== undefined) info.set(record.key, judged.info);
  }
  return { results: out, info };
}
