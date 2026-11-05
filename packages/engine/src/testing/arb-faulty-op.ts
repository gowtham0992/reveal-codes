/**
 * `arbFaultyOp` (design "Arbitraries" table, Property 10; Req 22.1, 22.4).
 * Each value carries one or more injected faults from {invalid threshold,
 * non-integer or out-of-range field, `from > to`, surrogate split, bad
 * Origin, Run_Id rule violation, bad Actor}. Every fault part records its
 * own error at generation time, and the parts touch disjoint fields, so the
 * expected error is the first recorded one in the order `invalid_config`,
 * `out_of_range`, `inverted_range`, `split_surrogate` (document, then
 * text), `invalid_provenance`. It is never inferred from the engine.
 */
import fc from "fast-check";
import type { EngineError } from "../errors.js";
import type { CallerOperation, Document, EngineConfig, Origin, Provenance } from "../types.js";
import { isValidBoundary } from "../validate.js";
import {
  arbBoundary,
  arbCallerProvenance,
  arbRange,
  arbThreshold,
  RUN_ID_POOL,
} from "./arb-ops.js";
import { arbStringWithLoneSurrogate, arbText, arbTimestamp } from "./arb-text.js";

/** A rejected op, the config to apply it under, and the error `apply` must return. */
export type FaultyOp = Readonly<{
  op: CallerOperation;
  config: EngineConfig | undefined;
  expected: EngineError;
}>;

type Part<T> = Readonly<{ value: T; error: EngineError | null }>;
type OpKind = CallerOperation["kind"];

const valid = <T>(arb: fc.Arbitrary<T>): fc.Arbitrary<Part<T>> =>
  arb.map((value) => ({ value, error: null }));

const maybe = <T>(ok: fc.Arbitrary<Part<T>>, bad: fc.Arbitrary<Part<T>>): fc.Arbitrary<Part<T>> =>
  fc.oneof(ok, bad);

/** Config: a valid setting, or a threshold outside (0, 1] (`invalid_config`). */
const arbConfigPart: fc.Arbitrary<Part<EngineConfig | undefined>> = maybe(
  valid(arbThreshold.map((t) => t.config)),
  fc
    .oneof(
      fc.constantFrom(0, -0.4, 1.5, Number.NaN, Infinity, -Infinity),
      fc.double({ min: 1, minExcluded: true, noNaN: true }),
    )
    .map((value) => ({
      value: { relabelThreshold: value },
      error: { kind: "invalid_config", field: "relabelThreshold", value },
    })),
);

const fieldsOf = (kind: OpKind): readonly ("at" | "from" | "to")[] =>
  kind === "insert" ? ["at"] : ["from", "to"];

/** A value that is not an integer in [0, len]. */
const arbOutOfRange = (len: number): fc.Arbitrary<number> =>
  fc.oneof(
    fc.integer({ min: -1000, max: -1 }),
    fc.integer({ min: len + 1, max: len + 1000 }),
    fc.integer({ min: 0, max: len }).map((n) => n + 0.5),
    fc.constantFrom(Number.NaN, Infinity, -Infinity),
  );

/** Valid offsets with a non-empty set of fields replaced by out-of-range values. */
function arbRangeFault(
  doc: Document,
  kind: OpKind,
  base: readonly number[],
): fc.Arbitrary<Part<readonly number[]>> {
  const len = doc.text.length;
  const fields = fieldsOf(kind);
  const masks =
    kind === "insert"
      ? [[true]]
      : [
          [true, false],
          [false, true],
          [true, true],
        ];
  return fc
    .tuple(fc.constantFrom(...masks), arbOutOfRange(len), arbOutOfRange(len))
    .map(([mask, b0, b1]) => {
      const bad = [b0, b1];
      const value = base.map((v, i) => (mask[i] === true ? (bad[i] ?? v) : v));
      const first = mask.indexOf(true);
      const field = fields[first] ?? "at";
      return { value, error: { kind: "out_of_range", field, value: value[first], length: len } };
    });
}

/** `from > to`, both Valid_Boundaries (`inverted_range`); needs a non-empty Text. */
function arbInverted(doc: Document): fc.Arbitrary<Part<readonly number[]>> {
  const text = doc.text;
  return fc.tuple(fc.integer({ min: 0, max: text.length - 1 }), fc.nat()).map(([l, k]) => {
    const lo = isValidBoundary(text, l) ? l : l - 1;
    const h = lo + 1 + (k % (text.length - lo));
    const hi = isValidBoundary(text, h) ? h : h + 1;
    return { value: [hi, lo], error: { kind: "inverted_range", from: hi, to: lo } };
  });
}

/** Offsets inside a Surrogate_Pair of `doc.text`. */
const interiors = (text: string): readonly number[] =>
  Array.from({ length: text.length + 1 }, (_, i) => i).filter((i) => !isValidBoundary(text, i));

/**
 * A field set to a Surrogate_Pair interior `p` (`split_surrogate` in the
 * document), or `from = p + 1 > to = p`, where `inverted_range` wins.
 */
function arbSplitFault(
  kind: OpKind,
  points: readonly number[],
): fc.Arbitrary<Part<readonly number[]>> {
  const split = (offset: number): EngineError => ({
    kind: "split_surrogate",
    offset,
    where: "document",
  });
  return fc.constantFrom(...points).chain((p) => {
    if (kind === "insert") return fc.constant({ value: [p], error: split(p) });
    return fc.constantFrom<Part<readonly number[]>>(
      { value: [p, p + 1], error: split(p) },
      { value: [p - 1, p], error: split(p) },
      { value: [p, p], error: split(p) },
      { value: [p + 1, p], error: { kind: "inverted_range", from: p + 1, to: p } },
    );
  });
}

/** Offsets for an op of `kind`: valid, or with a range, inversion, or split fault. */
function arbOffsetPart(doc: Document, kind: OpKind): fc.Arbitrary<Part<readonly number[]>> {
  const base =
    kind === "insert" ? arbBoundary(doc).map((a) => [a]) : arbRange(doc).map((r) => [...r]);
  const faults = [base.chain((b) => arbRangeFault(doc, kind, b))];
  if (kind !== "insert" && doc.text.length > 0) faults.push(arbInverted(doc));
  const points = interiors(doc.text);
  if (points.length > 0) faults.push(arbSplitFault(kind, points));
  return maybe(valid(base), fc.oneof(...faults));
}

/** Inserted text: valid, or holding a lone surrogate (`split_surrogate` in the text). */
const arbTextPart: fc.Arbitrary<Part<string>> = maybe(
  valid(arbText),
  arbStringWithLoneSurrogate.map(({ text, offset }) => ({
    value: text,
    error: { kind: "split_surrogate", offset, where: "text" },
  })),
);

const asOrigin = (s: string): Origin => s as Origin;

/** A bad Origin (`AI>HUM` or a non-Origin string), with or without a Run_Id. */
const arbBadOrigin: fc.Arbitrary<Part<Provenance>> = fc
  .tuple(fc.constantFrom("AI>HUM", "BOT", "", "hum", "AI "), fc.boolean(), arbTimestamp)
  .map(([o, withRun, timestamp]) => {
    const origin = asOrigin(o);
    const value: Provenance = withRun ? { origin, runId: "r1", timestamp } : { origin, timestamp };
    return { value, error: { kind: "invalid_provenance", field: "origin", value: o } };
  });

/** A Run_Id rule violation: `AI` without a non-empty Run_Id, or `HUM`/`PST` with one. */
const arbBadRunId: fc.Arbitrary<Part<Provenance>> = fc.oneof(
  arbTimestamp.map((timestamp): Part<Provenance> => ({
    value: { origin: "AI", timestamp },
    error: { kind: "invalid_provenance", field: "runId", value: undefined },
  })),
  arbTimestamp.map((timestamp): Part<Provenance> => ({
    value: { origin: "AI", runId: "", timestamp },
    error: { kind: "invalid_provenance", field: "runId", value: "" },
  })),
  fc
    .tuple(
      fc.constantFrom("HUM" as const, "PST" as const),
      fc.constantFrom(...RUN_ID_POOL),
      arbTimestamp,
    )
    .map(([origin, runId, timestamp]): Part<Provenance> => ({
      value: { origin, runId, timestamp },
      error: { kind: "invalid_provenance", field: "runId", value: runId },
    })),
);

/** Delete Actor: valid (including `AI>HUM`), or not one of the four Origins. */
const arbActorPart: fc.Arbitrary<Part<Origin>> = maybe(
  valid(fc.constantFrom<Origin>("HUM", "PST", "AI", "AI>HUM")),
  fc.constantFrom("BOT", "", "hum", "ai>hum").map((a) => ({
    value: asOrigin(a),
    error: { kind: "invalid_provenance", field: "actor", value: a },
  })),
);

type Parts = Readonly<{
  config: Part<EngineConfig | undefined>;
  offsets: Part<readonly number[]>;
  text: Part<string>;
  provenance: Part<Provenance>;
  actor: Part<Origin>;
}>;

/** Builds the op of `kind` from its parts. */
function buildOp(kind: OpKind, p: Parts): CallerOperation {
  const [a = 0, b = 0] = p.offsets.value;
  if (kind === "insert") return { kind, at: a, text: p.text.value, provenance: p.provenance.value };
  if (kind === "delete") return { kind, from: a, to: b, actor: p.actor.value };
  return { kind, from: a, to: b, text: p.text.value, provenance: p.provenance.value };
}

/** The recorded errors of the parts `kind` uses, in precedence order. */
function errorsOf(kind: OpKind, p: Parts): readonly (EngineError | null)[] {
  if (kind === "delete") return [p.config.error, p.offsets.error, p.actor.error];
  return [p.config.error, p.offsets.error, p.text.error, p.provenance.error];
}

function arbFaultyOfKind(doc: Document, kind: OpKind): fc.Arbitrary<FaultyOp> {
  const provenance = maybe(valid(arbCallerProvenance(doc)), fc.oneof(arbBadOrigin, arbBadRunId));
  return fc
    .record({
      config: arbConfigPart,
      offsets: arbOffsetPart(doc, kind),
      text: arbTextPart,
      provenance,
      actor: arbActorPart,
    })
    .map((parts) => ({
      op: buildOp(kind, parts),
      config: parts.config.value,
      expected: errorsOf(kind, parts).find((e) => e !== null) ?? null,
    }))
    .filter((f): f is FaultyOp => f.expected !== null);
}

/**
 * A Caller_Operation against `doc` with at least one injected fault, the
 * config to apply it under, and the error `apply` must return (Property 10).
 */
export function arbFaultyOp(doc: Document): fc.Arbitrary<FaultyOp> {
  return fc
    .constantFrom<OpKind>("insert", "delete", "replace")
    .chain((kind) => arbFaultyOfKind(doc, kind));
}
