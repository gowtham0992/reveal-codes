import type { Document, IssueKey } from "@reveal-codes/engine";
import { courtListenerLink } from "@reveal-codes/verifier/link";
import type { DisplayInfo } from "@reveal-codes/verifier/link";

/** Display_Info of the latest completed Verify_Run. Memory only; null until a run completes. */
export type ResolvedSession = Readonly<{
  epoch: number;
  info: ReadonlyMap<IssueKey, DisplayInfo>;
}> | null;

export type ResolvedRow = Readonly<{
  key: IssueKey;
  /** The citation as written; the component shortens it for display. */
  text: string;
  clusterId: string;
  found: string | null;
  href: string | null;
}>;

function foundText(info: DisplayInfo): string {
  return info.foundYear === undefined
    ? info.foundName
    : `${info.foundName} (${String(info.foundYear)})`;
}

/**
 * The Resolved_List rows: null when no Verify_Run has completed this session, otherwise one row per
 * `verified` Full_Citation in document order (empty when there is none).
 */
export function resolvedRows(
  doc: Document,
  session: ResolvedSession,
  currentEpoch: number,
): readonly ResolvedRow[] | null {
  if (session === null) return null;
  const rows: ResolvedRow[] = [];
  for (const c of doc.citations) {
    if (c.kind !== "full" || c.result.status !== "verified") continue;
    const clusterId = c.result.clusterId;
    const info = session.info.get(c.key);
    const usable =
      session.epoch === currentEpoch && info !== undefined && info.clusterId === clusterId;
    rows.push({
      key: c.key,
      text: doc.text.slice(c.citation.start, c.citation.end),
      clusterId,
      found: usable ? foundText(info) : null,
      href: courtListenerLink(clusterId, usable ? info.absoluteUrl : undefined),
    });
  }
  return rows;
}

/** The session's Display_Info while it belongs to the current Document epoch, otherwise undefined. */
export function usableInfo(
  session: ResolvedSession,
  currentEpoch: number,
): ReadonlyMap<IssueKey, DisplayInfo> | undefined {
  return session !== null && session.epoch === currentEpoch ? session.info : undefined;
}
