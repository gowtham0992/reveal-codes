import type { Document, IssueKey } from "@reveal-codes/engine";
import { displayFor, foundText } from "./check-rows";
import { courtListenerLink } from "@reveal-codes/verifier/link";
import type { DisplayInfo } from "@reveal-codes/verifier/link";
import { storableInfo } from "../storable-info";

/** The write rule lives in `src/storable-info.ts` so `persist.ts` (a state module) can use it. */
export { storableInfo };

/**
 * Display_Info of the latest completed Verify_Run. Kept in memory and stored with the saved draft
 * (never in the Document); null until a run completes or a draft with saved entries is restored.
 */
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
    const shown = session.epoch === currentEpoch ? displayFor(clusterId, info) : undefined;
    rows.push({
      key: c.key,
      text: doc.text.slice(c.citation.start, c.citation.end),
      clusterId,
      found: shown === undefined ? null : foundText(shown),
      href: courtListenerLink(clusterId, shown?.absoluteUrl),
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
