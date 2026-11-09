import type { Document, IssueKey } from "@reveal-codes/engine";

// Copy of verifiedCluster, ownerCluster and quotesByCluster in apps/web/src/client/verify-flow.ts. Keep the two in step.

function verifiedCluster(document: Document, start: number): string | null {
  const owner = document.citations.find((c) => c.citation.start === start);
  if (owner?.kind !== "full" || owner.result.status !== "verified") return null;
  return owner.result.clusterId;
}

function ownerCluster(document: Document, citationStart: number): string | null {
  const attached = document.citations.find((c) => c.citation.start === citationStart);
  if (attached === undefined) return null;
  const value = attached.citation.value;
  if (attached.kind === "short" && value.kind === "short") {
    return value.targetStart === null ? null : verifiedCluster(document, value.targetStart);
  }
  return verifiedCluster(document, citationStart);
}

export function quotesByCluster(document: Document): ReadonlyMap<string, readonly IssueKey[]> {
  const groups = new Map<string, IssueKey[]>();
  for (const q of document.quotes) {
    const cluster = ownerCluster(document, q.quote.citationStart);
    if (cluster === null) continue;
    const keys = groups.get(cluster);
    if (keys === undefined) groups.set(cluster, [q.key]);
    else keys.push(q.key);
  }
  return groups;
}
