import type { Document, IssueKey } from "@reveal-codes/engine";
import type { DisplayInfo } from "@reveal-codes/verifier/link";

/**
 * The entries of `info` that may be stored: the Document holds a Full_Citation with that key whose
 * result is `verified` or `wrong_case` and whose `clusterId` equals the entry's (Requirement 25.7).
 * The result is in key order (document order), so equal inputs write equal strings.
 */
export function storableInfo(
  doc: Document,
  info: ReadonlyMap<IssueKey, DisplayInfo>,
): ReadonlyMap<IssueKey, DisplayInfo> {
  const kept = new Map<IssueKey, DisplayInfo>();
  for (const c of doc.citations) {
    if (c.kind !== "full") continue;
    if (c.result.status !== "verified" && c.result.status !== "wrong_case") continue;
    const entry = info.get(c.key);
    if (entry !== undefined && entry.clusterId === c.result.clusterId) kept.set(c.key, entry);
  }
  return kept;
}
