import { createDocument, recordOverride, setVerification } from "@reveal-codes/engine";
import type { Document, IssueKey, VerificationResult } from "@reveal-codes/engine";
import type { DisplayInfo } from "@reveal-codes/verifier/link";
import { IssuesRegion } from "../../src/components/issues-region";
import type { ResolvedSession } from "../../src/client/resolved";
import { createStore } from "../../src/store-runtime";
import { renderUi } from "./render";

export const ISO = "2026-11-02T12:00:00.000Z";
export const NOW = (): Date => new Date(ISO);
export const noop = (): void => undefined;
export const WRONG: VerificationResult = {
  status: "wrong_case",
  clusterId: "145875",
  foundName: "Ashcroft v. Iqbal",
  foundYear: 2009,
};
export const WRONG_NO_YEAR: VerificationResult = {
  status: "wrong_case",
  clusterId: "145875",
  foundName: "Ashcroft v. Iqbal",
};
export const TEXT = "See Henderson v. Pacific Housing Authority, 556 U.S. 662, 678 (2009).";
export const LINK = "View on CourtListener";

export function build(text: string): Document {
  const created = createDocument(text, ISO);
  if (!created.ok) throw new Error("fixture rejected");
  return created.value;
}

export function keysOf(doc: Document): IssueKey[] {
  return doc.citations.filter((c) => c.kind === "full").map((c) => c.key);
}

export function withResults(text: string, results: readonly VerificationResult[]): Document {
  let doc = build(text);
  keysOf(doc).forEach((key, i) => {
    const result = results[i];
    if (result === undefined) return;
    const set = setVerification(doc, key, result);
    if (!set.ok) throw new Error(`verification rejected: ${set.error.kind}`);
    doc = set.value;
  });
  return doc;
}

export function overridden(doc: Document): Document {
  const key = keysOf(doc)[0];
  if (key === undefined) throw new Error("no citation");
  const r = recordOverride(doc, key, "Checked by hand against the reporter.", ISO);
  if (!r.ok) throw new Error(`override rejected: ${r.error.kind}`);
  return r.value;
}

export type RegionExtra = Readonly<{ resolved?: ResolvedSession; verifiedAt?: string | null }>;

export function region(doc: Document, extra: RegionExtra = {}) {
  const store = createStore(NOW);
  const props = {
    document: doc,
    store,
    now: NOW,
    onGo: noop,
    verifiedAt: extra.verifiedAt ?? null,
    note: null,
    verify: { start: noop, disabled: false },
    ...(extra.resolved === undefined ? {} : { resolved: extra.resolved }),
  };
  renderUi(<IssuesRegion {...props} />);
  return store;
}

export function sessionFor(
  store: ReturnType<typeof createStore>,
  info: ReadonlyMap<IssueKey, DisplayInfo>,
): ResolvedSession {
  return { epoch: store.getState().epoch, info };
}
