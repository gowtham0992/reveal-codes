/**
 * Reveal Codes fault arbitraries (design "Arbitraries" table, Properties 40
 * and 41; Req 22.1, 22.4):
 * - `arbSyntaxFault(rendering)`: one or more syntax faults injected into a
 *   Full_Rendering, with the index of the lowest recorded at injection time;
 * - `arbSemanticTamper(doc)`: one tamper of the Full_Rendering of `doc` that
 *   stays syntactically valid but violates exactly one Req 20.4/20.5 rule,
 *   with the expected `MalformedRule` and input index recorded;
 * - `arbTamperDocument`: `arbDocument` plus small targeted Documents, so
 *   every tamper kind has applicable inputs (unlisted LEXIS citations,
 *   Other_References, Short_Forms with states, quotes).
 * Built from fast-check combinators only. A tamper that cannot apply to a
 * Document is left out of the `fc.constantFrom` choice, never filtered.
 */
import fc from "fast-check";
import type { Arbitrary } from "fast-check";
import { DOC_NUMBER_RANGE, YEAR_RANGE } from "../citations/lex.js";
import { render } from "../codes.js";
import { createDocument } from "../document.js";
import type { EngineError } from "../errors.js";
import type { Result } from "../result.js";
import type { Document } from "../types.js";
import { arbUnlistedLexisCourt } from "./arb-citation.js";
import { arbDocument } from "./arb-document.js";
import { applyStateWrites, arbStateWrites } from "./arb-state.js";
import { TS, scanRendering } from "./arb-codes-scan.js";
import type { Builder, SemanticTamper, TamperKind } from "./arb-codes-scan.js";
import {
  quoExtra,
  citShifted,
  quoRemoved,
  refExtra,
  refMissing,
  refMoved,
} from "./arb-codes-extractor.js";
import * as T from "./arb-codes-tampers.js";
import * as C from "./arb-codes-citations.js";

export { arbSyntaxFault, SYNTAX_FAULT_KINDS } from "./arb-codes-syntax.js";
export type { InjectedFault, SyntaxFault, SyntaxFaultKind } from "./arb-codes-syntax.js";
export type { SemanticTamper, TamperKind } from "./arb-codes-scan.js";

const BUILDERS: Readonly<Record<TamperKind, Builder>> = {
  coverage_drop: T.coverageDrop,
  coverage_empty: T.coverageEmpty,
  canonical_split: T.canonicalSplit,
  provenance_empty_run: T.provenanceEmptyRun,
  run_flip: T.runFlip,
  run_missing: T.runMissing,
  surrogate: T.surrogate,
  quote_prefix: T.quotePrefix,
  short_code: C.shortCode,
  short_count: C.shortCount,
  unverifiable_lexis: C.unverifiableLexis,
  ref_as_cit: C.refAsCit,
  ref_override: C.refOverride,
  override_nonissue: C.overrideNonIssue,
  issue_key_counter: C.issueKeyCounter,
  issue_key_duplicate: C.issueKeyDuplicate,
  ref_missing: refMissing,
  ref_extra: refExtra,
  ref_moved: refMoved,
  cit_shifted: citShifted,
  quo_extra: quoExtra,
  quo_removed: quoRemoved,
};

/** Every tamper kind, in a fixed order. */
export const TAMPER_KINDS: readonly TamperKind[] = Object.keys(BUILDERS) as TamperKind[];

/**
 * One tamper of `render(doc, "full")` drawn from the kinds that apply to
 * `doc`. The empty-span coverage tamper applies to every Document, so the
 * choice is never empty.
 */
export function arbSemanticTamper(doc: Document): Arbitrary<SemanticTamper> {
  const ctx = { doc, s: scanRendering(render(doc, "full").text) };
  const applicable = TAMPER_KINDS.flatMap((k) => {
    const arb = BUILDERS[k](ctx);
    return arb === undefined ? [] : [arb];
  });
  return fc.constantFrom(...applicable).chain((arb) => arb);
}

const isOk = (r: Result<Document, EngineError>): r is Readonly<{ ok: true; value: Document }> =>
  r.ok;

const fromText = (text: string): Arbitrary<Document> =>
  fc
    .constant(text)
    .map((t) => createDocument(t, TS))
    .filter(isOk)
    .map((r) => r.value);

/** `See <year> <unlisted court> LEXIS <n>.`: an unlisted LEXIS Database_Citation (D22). */
const arbLexisDocument: Arbitrary<Document> = fc
  .tuple(
    fc.integer({ min: YEAR_RANGE.min, max: YEAR_RANGE.max }),
    arbUnlistedLexisCourt,
    fc.integer({ min: DOC_NUMBER_RANGE.min, max: DOC_NUMBER_RANGE.max }),
  )
  .chain(([year, court, n]) => fromText(`See ${String(year)} ${court} LEXIS ${String(n)}.`));

/** `See <t> U.S.C. § <m> here.`: an Other_Reference. */
const arbRefDocument: Arbitrary<Document> = fc
  .tuple(fc.integer({ min: 1, max: 50 }), fc.integer({ min: 1, max: 999 }))
  .chain(([t, m]) => fromText(`See ${String(t)} U.S.C. § ${String(m)} here.`));

/** A Full_Citation with an attached quote and an `Id.` Short_Form, in a random state. */
const arbShortFormDocument: Arbitrary<Document> = fc
  .tuple(fc.integer({ min: 1, max: 600 }), fc.integer({ min: 1, max: 900 }))
  .chain(([v, p]) =>
    fromText(
      `Roe v. Wade, ${String(v)} U.S. ${String(p)} (1973) ("hello world"). Id. at ${String(p + 1)}.`,
    ),
  )
  .chain((doc) => arbStateWrites(doc).map((writes) => applyStateWrites(doc, writes)));

/** `arbDocument` mixed with targeted Documents so every tamper kind has inputs. */
export const arbTamperDocument: Arbitrary<Document> = fc.oneof(
  { arbitrary: arbDocument, weight: 4 },
  { arbitrary: arbLexisDocument, weight: 1 },
  { arbitrary: arbRefDocument, weight: 1 },
  { arbitrary: arbShortFormDocument, weight: 2 },
);
