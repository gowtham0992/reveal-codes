import * as fc from "fast-check";
import type { CitationRecord } from "@reveal-codes/engine";
// The engine's `testing/` folder is deliberately not exported from its index (engine Req 1.2).
import { arbDocument, arbDocumentText } from "../../../engine/src/testing/arb-document";

/**
 * Citation records of an engine-reachable Document: all kinds (full, short,
 * other), keys as the engine assigned them (design "Arbitraries").
 */
export const arbRecords: fc.Arbitrary<readonly CitationRecord[]> = arbDocument.map(
  (doc) => doc.citations,
);

/** The input of the request-body properties (2, 11, 12): records, an independent draft, an optional token. */
export type LookupCase = Readonly<{
  records: readonly CitationRecord[];
  draft: string;
  token: string | undefined;
}>;

export const arbLookupCase: fc.Arbitrary<LookupCase> = fc.record({
  records: arbRecords,
  draft: arbDocumentText,
  token: fc.option(fc.stringMatching(/^[0-9a-f]{8,16}$/), { nil: undefined }),
});
