import * as fc from "fast-check";
import type { CitationRecord } from "@reveal-codes/engine";
import { planLookup } from "../../src/lookup";
import { arbLookupBody } from "./arb-lookup";
import { arbRecords } from "./arb-records";

/** Property 6 input: records, one scripted response body per sendable chunk, and a gap under 24 h. */
export type CachedCase = Readonly<{
  records: readonly CitationRecord[];
  bodies: readonly unknown[];
  gapMs: number;
}>;

const HOUR_MS = 3_600_000;

/**
 * Records plus, for each request-sized chunk the first lookup will send, a
 * response body mixing terminal and unchecked outcomes (and occasionally a
 * malformed body, which leaves the whole chunk unchecked).
 */
export const arbCachedCase: fc.Arbitrary<CachedCase> = arbRecords.chain((records) => {
  const chunks = planLookup(records).chunks.filter((c) => !c.oversize);
  return fc.record({
    records: fc.constant(records),
    bodies: fc.tuple(...chunks.map((c) => arbLookupBody(c.lines))),
    gapMs: fc.integer({ min: 0, max: 22 * HOUR_MS }),
  });
});
