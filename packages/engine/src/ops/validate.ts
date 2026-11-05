/**
 * Validation of `apply` inputs (design A2, Req 6.5, 6.6, 6.10, 7). Pure
 * functions over plain data. Every check reads fields as `unknown`, so
 * type-conforming but malformed runtime values are rejected as values.
 */
import type {
  InvalidConfig,
  InvalidProvenance,
  InvalidTimestamp,
  InvertedRange,
  OutOfRange,
  SplitSurrogate,
} from "../errors.js";
import { err, ok, type Result } from "../result.js";
import type { CallerOperation, Document, EngineConfig, Origin, Provenance } from "../types.js";
import {
  checkProvenance,
  firstUnpairedSurrogate,
  isTimestamp,
  isValidBoundary,
} from "../validate.js";

/** Relabel_Threshold used when the caller supplies none (Req 6.10). */
export const DEFAULT_RELABEL_THRESHOLD = 0.4;

/** Errors `validateCallerOp` can return, in precedence order (Req 7.6). */
export type CallerOpError =
  OutOfRange | InvertedRange | SplitSurrogate | InvalidProvenance | InvalidTimestamp;

type OffsetField = "at" | "from" | "to";

const ORIGINS: readonly Origin[] = ["HUM", "PST", "AI", "AI>HUM"];

/**
 * Returns the effective Relabel_Threshold (Req 6.5, 6.10), or
 * `invalid_config` unless it is a finite number in (0, 1] (Req 6.6).
 * A `relabelThreshold` key that is present counts as supplied, even when it
 * holds `undefined`, matching `checkProvenance`'s treatment of `runId`.
 */
export function validateConfig(config?: EngineConfig): Result<number, InvalidConfig> {
  if (config === undefined) return ok(DEFAULT_RELABEL_THRESHOLD);
  if (!Object.prototype.hasOwnProperty.call(config, "relabelThreshold")) {
    return ok(DEFAULT_RELABEL_THRESHOLD);
  }
  const t: unknown = config.relabelThreshold;
  if (typeof t === "number" && Number.isFinite(t) && t > 0 && t <= 1) return ok(t);
  return err({ kind: "invalid_config", field: "relabelThreshold", value: t });
}

/** The offset fields of `op`, in the fixed field order `at`, `from`, `to`. */
function offsetFields(op: CallerOperation): readonly (readonly [OffsetField, unknown])[] {
  if (op.kind === "insert") return [["at", op.at]];
  return [
    ["from", op.from],
    ["to", op.to],
  ];
}

function checkRange(
  length: number,
  fields: readonly (readonly [OffsetField, unknown])[],
): Result<void, OutOfRange | InvertedRange> {
  for (const [field, value] of fields) {
    const inRange = typeof value === "number" && Number.isInteger(value);
    if (!inRange || value < 0 || value > length) {
      return err({ kind: "out_of_range", field, value, length });
    }
  }
  const [first, second] = fields;
  if (first !== undefined && second !== undefined) {
    const from = first[1] as number;
    const to = second[1] as number;
    if (from > to) return err({ kind: "inverted_range", from, to });
  }
  return ok(undefined);
}

function checkSurrogates(
  docText: string,
  op: CallerOperation,
  fields: readonly (readonly [OffsetField, unknown])[],
): Result<void, SplitSurrogate> {
  for (const [, value] of fields) {
    const offset = value as number;
    if (!isValidBoundary(docText, offset)) {
      return err({ kind: "split_surrogate", offset, where: "document" });
    }
  }
  if (op.kind === "delete") return ok(undefined);
  const lone = firstUnpairedSurrogate(op.text);
  if (lone !== null) return err({ kind: "split_surrogate", offset: lone, where: "text" });
  return ok(undefined);
}

/**
 * Req 7.4, 7.5. For Insert and Replace: Origin membership, then the
 * caller-side `AI>HUM` ban, then the Run_Id rule. For Delete: Actor
 * membership (`AI>HUM` is a permitted Actor).
 */
function checkOpProvenance(op: CallerOperation): Result<void, InvalidProvenance> {
  if (op.kind === "delete") {
    const actor: unknown = op.actor;
    if (ORIGINS.some((o) => o === actor)) return ok(undefined);
    return err({ kind: "invalid_provenance", field: "actor", value: actor });
  }
  const origin: unknown = op.provenance.origin;
  if (origin === "AI>HUM")
    return err({ kind: "invalid_provenance", field: "origin", value: origin });
  const checked = checkProvenance(op.provenance);
  return checked.ok ? ok(undefined) : checked;
}

function checkTimestamp(op: CallerOperation): Result<void, InvalidTimestamp> {
  if (op.kind === "delete") return ok(undefined);
  const provenance: Provenance = op.provenance;
  const value: unknown = provenance.timestamp;
  return isTimestamp(value) ? ok(undefined) : err({ kind: "invalid_timestamp", value });
}

/**
 * Validates a Caller_Operation against `doc`, returning the first failure in
 * the fixed order `out_of_range` (fields `at`, `from`, `to`),
 * `inverted_range`, `split_surrogate` (boundary faults in field order, then
 * the first unpaired surrogate in `text`), `invalid_provenance`, and
 * `invalid_timestamp` (design A2, Req 7.6). Returns `op` unchanged on success.
 */
export function validateCallerOp(
  doc: Document,
  op: CallerOperation,
): Result<CallerOperation, CallerOpError> {
  const fields = offsetFields(op);
  const steps: readonly (() => Result<void, CallerOpError>)[] = [
    () => checkRange(doc.text.length, fields),
    () => checkSurrogates(doc.text, op, fields),
    () => checkOpProvenance(op),
    () => checkTimestamp(op),
  ];
  for (const step of steps) {
    const result = step();
    if (!result.ok) return result;
  }
  return ok(op);
}
