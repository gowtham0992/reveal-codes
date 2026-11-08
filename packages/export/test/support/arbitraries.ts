import * as fc from "fast-check";
import type { Document } from "@reveal-codes/engine";
import { arbDocument } from "../../../engine/src/testing/arb-document";
import type { Meta, RunInfo } from "../../src/index.js";

/**
 * Number of runs for every property test: `FC_NUM_RUNS` if set to a positive
 * integer, else 500 when `CI` is set, else 200. Same pattern as
 * `apps/web/test/support/fc.ts`.
 */
export function runs(env: Readonly<Record<string, string | undefined>> = process.env): number {
  const raw = env["FC_NUM_RUNS"];
  if (raw !== undefined && /^[1-9]\d*$/.test(raw)) return Number(raw);
  const ci = env["CI"];
  return ci !== undefined && ci !== "" ? 500 : 200;
}

const PROVIDERS = ["bedrock", "anthropic", "fixture"] as const;
const MODELS: readonly (string | null)[] = [null, "m-1", "m-2"];

/** One run-log entry for `runId`; small provider and model pools make duplicate pairs common. */
function arbEntry(runId: string): fc.Arbitrary<RunInfo> {
  return fc.record({
    runId: fc.constant(runId),
    provider: fc.constantFrom(...PROVIDERS),
    modelId: fc.constantFrom(...MODELS),
  });
}

/** Run logs for `doc`: zero to three entries per run in `doc.runs`, plus entries for unused runs. */
export function arbRunLog(doc: Document): fc.Arbitrary<readonly RunInfo[]> {
  const ids = [...doc.runs.map((r) => r.runId), "unused-1", "unused-2"];
  return fc
    .array(fc.constantFrom(...ids).chain(arbEntry), { maxLength: 8 })
    .map((entries) => entries);
}

const arbInstant: fc.Arbitrary<Date> = fc.date({
  min: new Date("2000-01-01T00:00:00.000Z"),
  max: new Date("2100-01-01T00:00:00.000Z"),
  noInvalidDate: true,
});

/** Valid metadata: `now` is a valid Date, `verifiedAt` is null or an ISO 8601 UTC instant. */
export const arbMeta: fc.Arbitrary<Meta> = fc.record({
  now: arbInstant,
  verifiedAt: fc.option(
    arbInstant.map((d) => d.toISOString()),
    { nil: null },
  ),
});

export type ExportCase = Readonly<{ document: Document; runLog: readonly RunInfo[]; meta: Meta }>;

/** A Document from the Engine's `arbDocument`, a run log for it, and valid metadata. */
export const arbExportCase: fc.Arbitrary<ExportCase> = arbDocument.chain((document) =>
  fc.record({
    document: fc.constant(document),
    runLog: arbRunLog(document),
    meta: arbMeta,
  }),
);
