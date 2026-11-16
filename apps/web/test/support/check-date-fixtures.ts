import type { Document, VerificationResult } from "@reveal-codes/engine";
import type { ApiClient, FullRecord } from "../../src/client/api";
import { createStore } from "../../src/store-runtime";
import type { Store } from "../../src/store-runtime";
import { EXPORT_NOW } from "./export-fixtures";
import { verifiedDemoDocument } from "./persist-fixtures";

/**
 * A Store as after a restore: `document` (by default the demo motion holding results) is
 * dispatched with `replace`, an empty run log and no check date.
 */
export function restoredStore(document: Document): Store {
  const store = createStore(() => EXPORT_NOW);
  store.dispatch({ type: "replace", document, runLog: [], verifiedAt: null });
  return store;
}

/** The restored Store of the demo motion whose citations and quotes hold results. */
export async function restoredDemoStore(): Promise<Store> {
  return restoredStore(await verifiedDemoDocument());
}

export type FakeVerifyApi = Readonly<{
  api: ApiClient;
  /** Every record given to `verify`, in call order. */
  seen: readonly FullRecord[];
}>;

const VERIFIED = (record: FullRecord): VerificationResult => ({
  status: "verified",
  clusterId: `fake-${String(record.citation.start)}`,
});

/** An ApiClient whose `verify` answers every record it is given; the other calls answer a network error. */
export function fakeVerifyApi(): FakeVerifyApi {
  const seen: FullRecord[] = [];
  const failed = () => Promise.resolve({ ok: false as const, error: { kind: "network" as const } });
  const api: ApiClient = {
    verify(records) {
      seen.push(...records);
      return Promise.resolve({
        ok: true,
        value: { pairs: records.map((r) => [r.key, VERIFIED(r)] as const), info: [] },
      });
    },
    opinion: failed,
    mode: failed,
    demoMotion: failed,
    aviancaCitations: failed,
    draft: failed,
  };
  return { api, seen };
}
