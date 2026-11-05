/**
 * Base `arbDocument` (design "Arbitraries" table, Properties 1, 6 to 13;
 * Req 22.1, 22.4). Built only through `createDocument` and `apply`: a text
 * from `arbText`, then `createDocument`, then an `arbOpTrace` applied under
 * one of two threshold settings, so every value is engine-reachable. The
 * low setting makes relabelled Runs common. Run_Ids come from
 * `RUN_ID_POOL` (8 ids, including `r[1]` and `a\b`). Verification,
 * quote-check, and Override writes are added by a later task.
 */
import fc from "fast-check";
import { createDocument } from "../document.js";
import type { EngineError } from "../errors.js";
import type { Result } from "../result.js";
import type { Document, EngineConfig } from "../types.js";
import { arbOpTrace, type OpStep } from "./arb-ops.js";
import { arbText, arbTimestamp } from "./arb-text.js";

/** The two threshold settings documents are built under: default 0.4, and 0.05. */
export const BUILD_CONFIGS: readonly (EngineConfig | undefined)[] = [
  undefined,
  { relabelThreshold: 0.05 },
];

const isOk = (r: Result<Document, EngineError>): r is Readonly<{ ok: true; value: Document }> =>
  r.ok;

/** Freshly created Documents: one `PST` span over an `arbText` string. */
export const arbCreatedDocument: fc.Arbitrary<Document> = fc
  .tuple(arbText, arbTimestamp)
  .map(([text, timestamp]) => createDocument(text, timestamp))
  .filter(isOk)
  .map((r) => r.value);

/** The Document after the last successful step, or `start` when there is none. */
const lastDocument = (start: Document, steps: readonly OpStep[]): Document =>
  steps.reduce((doc, s) => (s.result.ok ? s.result.value.document : doc), start);

/**
 * A Canonical_Document reached from `createDocument` by 0 to 20 valid
 * Caller_Operations, applied under the default threshold or 0.05.
 */
export const arbDocument: fc.Arbitrary<Document> = fc
  .tuple(arbCreatedDocument, fc.constantFrom(...BUILD_CONFIGS))
  .chain(([start, config]) => arbOpTrace(start, config).map((steps) => lastDocument(start, steps)));
