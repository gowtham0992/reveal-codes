/**
 * `arbStateOpSequence` (design "Arbitraries" table, D22; Property 35; Req
 * 15.8, 16.5, 22.1): interleavings of edits, verification writes, quote
 * writes, and Overrides, each drawn against the Document the previous steps
 * produced. Edits create unlisted LEXIS citations and land in and next to
 * them; `verified` writes are weighted toward their keys. Built only from
 * fast-check combinators, so values shrink.
 */
import fc from "fast-check";
import { apply } from "../document.js";
import type { EngineError } from "../errors.js";
import type { Result } from "../result.js";
import { ok } from "../result.js";
import type { CallerOperation, Document, EngineConfig, DatabaseValue } from "../types.js";
import { DOC_NUMBER_RANGE, YEAR_RANGE } from "../citations/lex.js";
import { arbUnlistedLexisCourt } from "./arb-citation.js";
import { arbBoundary, arbCallerProvenance, arbOp, snapBoundary } from "./arb-ops.js";
import {
  applyStateWrite,
  arbVerifiedResult,
  fullRecordsOf,
  isUnlistedLexisRecord,
  stateWriteOptions,
  type StateWrite,
} from "./arb-state.js";
import { arbText } from "./arb-text.js";
import { canonical } from "./arb-text-builder.js";

/** One step: an edit, or a state write with whether it must be `not_verifiable`. */
export type StateStep =
  | Readonly<{ kind: "op"; op: CallerOperation }>
  | Readonly<{ kind: "write"; write: StateWrite; expectNotVerifiable: boolean }>;

/** Applies `step` to `doc` under `config`; an edit's Result carries only the Document. */
export function applyStateStep(
  doc: Document,
  step: StateStep,
  config?: EngineConfig,
): Result<Document, EngineError> {
  if (step.kind === "write") return applyStateWrite(doc, step.write);
  const r = apply(doc, step.op, config);
  return r.ok ? ok(r.value.document) : r;
}

const unlistedKeys = (doc: Document): readonly string[] =>
  fullRecordsOf(doc)
    .filter(isUnlistedLexisRecord)
    .map((r) => r.key);

/** `<year> <unlisted court> LEXIS <n>` as written by the Canonical_Form. */
const arbUnlistedLexisText: fc.Arbitrary<string> = fc
  .tuple(
    fc.integer({ min: YEAR_RANGE.min, max: YEAR_RANGE.max }),
    arbUnlistedLexisCourt,
    fc.integer({ min: DOC_NUMBER_RANGE.min, max: DOC_NUMBER_RANGE.max }),
  )
  .map(([year, lexisCourt, number]) => {
    const value: DatabaseValue = {
      kind: "database",
      year,
      designator: "LEXIS",
      lexisCourtListed: false,
      lexisCourt,
      number,
    };
    return canonical(value);
  });

/** An Insert of a spaced-out unlisted LEXIS citation at a Valid_Boundary. */
function arbInsertUnlisted(doc: Document): fc.Arbitrary<CallerOperation> {
  return fc
    .tuple(arbBoundary(doc), arbUnlistedLexisText, arbCallerProvenance(doc))
    .map(([at, cit, provenance]): CallerOperation => ({
      kind: "insert",
      at,
      text: ` ${cit} `,
      provenance,
    }));
}

/** An edit whose range starts and ends within two code units of an unlisted LEXIS citation. */
function arbEditNearUnlisted(doc: Document): fc.Arbitrary<CallerOperation> {
  const keys = new Set(unlistedKeys(doc));
  const ranges = fullRecordsOf(doc)
    .filter((r) => keys.has(r.key))
    .map((r) => [r.citation.start, r.citation.end] as const);
  const len = doc.text.length;
  const at = (n: number): number => snapBoundary(doc.text, Math.min(len, Math.max(0, n)));
  return fc
    .tuple(
      fc.constantFrom(...ranges),
      fc.integer({ min: -2, max: 2 }),
      fc.integer({ min: -2, max: 2 }),
      fc.constantFrom("delete", "replace", "insert"),
      arbText,
      arbCallerProvenance(doc),
    )
    .map(([[s, e], da, db, how, text, provenance]): CallerOperation => {
      const a = at(s + da);
      const b = at(e + db);
      const [from, to] = a <= b ? [a, b] : [b, a];
      if (how === "delete") return { kind: "delete", from, to, actor: "HUM" };
      if (how === "insert") return { kind: "insert", at: from, text, provenance };
      return { kind: "replace", from, to, text, provenance };
    });
}

const mustBeNotVerifiable = (doc: Document, w: StateWrite): boolean =>
  w.kind === "verification" && w.result.status === "verified" && unlistedKeys(doc).includes(w.key);

/** One step against `doc`, weighted toward unlisted LEXIS citations when `doc` has them. */
function arbStep(doc: Document): fc.Arbitrary<StateStep> {
  const unlisted = unlistedKeys(doc);
  const edits: { arbitrary: fc.Arbitrary<CallerOperation>; weight: number }[] = [
    { arbitrary: arbOp(doc), weight: 3 },
    { arbitrary: arbInsertUnlisted(doc), weight: 2 },
  ];
  if (unlisted.length > 0) edits.push({ arbitrary: arbEditNearUnlisted(doc), weight: 4 });
  const writes = [...stateWriteOptions(doc)];
  if (unlisted.length > 0) {
    const aimed = fc
      .tuple(fc.constantFrom(...unlisted), arbVerifiedResult)
      .map(([key, result]): StateWrite => ({ kind: "verification", key, result }));
    writes.push({ arbitrary: aimed, weight: 6 });
  }
  const op = fc.oneof(...edits).map((o): StateStep => ({ kind: "op", op: o }));
  if (writes.length === 0) return op;
  const write = fc.oneof(...writes).map((w): StateStep => ({
    kind: "write",
    write: w,
    expectNotVerifiable: mustBeNotVerifiable(doc, w),
  }));
  return fc.oneof({ arbitrary: op, weight: 5 }, { arbitrary: write, weight: 5 });
}

/** `n` steps, each drawn against the Document the previous steps produced. */
function arbSteps(
  doc: Document,
  n: number,
  config: EngineConfig | undefined,
): fc.Arbitrary<readonly StateStep[]> {
  if (n === 0) return fc.constant([]);
  return arbStep(doc).chain((step) => {
    const r = applyStateStep(doc, step, config);
    const next = r.ok ? r.value : doc;
    return arbSteps(next, n - 1, config).map((rest) => [step, ...rest]);
  });
}

/**
 * 0 to 15 steps against `doc`: edits (including inserts of unlisted LEXIS
 * citations and edits into and next to existing ones), verification writes
 * (many aimed at unlisted LEXIS keys, with `expectNotVerifiable` recorded),
 * quote writes, and Overrides. A bad write is part of a sequence; the test
 * applies each step and treats an error from a write as a skipped step.
 */
export function arbStateOpSequence(
  doc: Document,
  config?: EngineConfig,
): fc.Arbitrary<readonly StateStep[]> {
  return fc.integer({ min: 0, max: 15 }).chain((n) => arbSteps(doc, n, config));
}
