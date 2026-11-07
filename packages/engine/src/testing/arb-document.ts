/**
 * Base `arbDocument` (design "Arbitraries" table, Properties 1, 6 to 13;
 * Req 22.1, 22.4). Built only through `createDocument` and `apply`: a text
 * from `arbText` or `arbTextWithCitations` (so Documents carry citations,
 * Short_Forms, and attached quotes), then `createDocument`, then an `arbOpTrace` applied under
 * one of two threshold settings, so every value is engine-reachable. The
 * low setting makes relabelled Runs common. Run_Ids come from
 * `RUN_ID_POOL` (8 ids, including `r[1]` and `a\b`). Verification,
 * quote-check, and Override writes are then applied through the Engine's
 * setters (`arbStateWrites`); a write that returns an error is skipped.
 */
import fc from "fast-check";
import { createDocument } from "../document.js";
import type { EngineError } from "../errors.js";
import type { Result } from "../result.js";
import type { Document, EngineConfig } from "../types.js";
import { arbOpTrace, type OpStep } from "./arb-ops.js";
import { applyStateWrites, arbStateWrites } from "./arb-state.js";
import { arbText, arbTimestamp } from "./arb-text.js";
import { arbTextWithCitations } from "./arb-text-citations.js";

/** The two threshold settings documents are built under: default 0.4, and 0.05. */
export const BUILD_CONFIGS: readonly (EngineConfig | undefined)[] = [
  undefined,
  { relabelThreshold: 0.05 },
];

const isOk = (r: Result<Document, EngineError>): r is Readonly<{ ok: true; value: Document }> =>
  r.ok;

/**
 * Document text: an `arbTextWithCitations` text (weight 3) or an `arbText`
 * string (weight 1). The ops after creation are biased into citation and
 * quote ranges and break many citations, so citation text is weighted up.
 */
export const arbDocumentText: fc.Arbitrary<string> = fc.oneof(
  { arbitrary: arbTextWithCitations.map((t) => t.text), weight: 3 },
  { arbitrary: arbText, weight: 1 },
);

/** Freshly created Documents: one `PST` span over an `arbDocumentText` string. */
export const arbCreatedDocument: fc.Arbitrary<Document> = fc
  .tuple(arbDocumentText, arbTimestamp)
  .map(([text, timestamp]) => createDocument(text, timestamp))
  .filter(isOk)
  .map((r) => r.value);

/** The Document after the last successful step, or `start` when there is none. */
const lastDocument = (start: Document, steps: readonly OpStep[]): Document =>
  steps.reduce((doc, s) => (s.result.ok ? s.result.value.document : doc), start);

/**
 * A Canonical_Document reached from `createDocument` by 0 to 20 valid
 * Caller_Operations, applied under the default threshold or 0.05, then 0 to
 * 12 verification, quote-check, and Override writes (skipped on error).
 */
export const arbDocument: fc.Arbitrary<Document> = fc
  .tuple(arbCreatedDocument, fc.constantFrom(...BUILD_CONFIGS))
  .chain(([start, config]) => arbOpTrace(start, config).map((steps) => lastDocument(start, steps)))
  .chain((doc) => arbStateWrites(doc).map((writes) => applyStateWrites(doc, writes)));
