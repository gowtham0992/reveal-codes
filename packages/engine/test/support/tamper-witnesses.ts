/**
 * Witness_Documents (Req 22.2, 22.14): for every `TamperKind`, one fixed
 * Document on which that kind's builder returns an arbitrary. Each is built
 * from fixed text through the Engine's own `createDocument`, `apply`,
 * `setVerification` and `recordOverride`, never from drawn state writes, so a
 * reachability test can draw `arbTamperOfKind(kind, TAMPER_WITNESSES[kind])`
 * without waiting for a random Document to contain the kind.
 *
 * The table is `Record<TamperKind, Document>`: adding a kind to `TamperKind`
 * without a witness here fails `tsc`. `missingWitnesses` names the kinds that
 * have no builder result on their witness at run time.
 */
import { apply, createDocument } from "../../src/document";
import type { EngineError } from "../../src/errors";
import type { Result } from "../../src/result";
import { arbTamperOfKind } from "../../src/testing/arb-codes";
import type { TamperKind } from "../../src/testing/arb-codes";
import type { Document } from "../../src/types";
import { setVerification } from "../../src/verification";

const TS = "2026-11-03T10:00:00Z";

/** Unwraps a fixed construction step; a failure here is a bug in this file. */
function must(r: Result<Document, EngineError>): Document {
  if (!r.ok) throw new Error(`witness construction failed: ${JSON.stringify(r.error)}`);
  return r.value;
}

const fromText = (text: string): Document => must(createDocument(text, TS));

const keyAt = (doc: Document, i: number): string => {
  const rec = doc.citations.filter((r) => r.kind === "full")[i];
  if (rec === undefined) throw new Error(`witness has no Full_Citation ${String(i)}`);
  return rec.key;
};

/** Empty Text: no span Code, so only the empty-span coverage tamper applies. */
const EMPTY = fromText("");

/** One PST span over prose with interior cut points. */
const PROSE = fromText("The court ruled.");

/** A PST span followed by an `AI` span of run `r1`. */
const AI_RUN = (() => {
  const r = apply(PROSE, {
    kind: "insert",
    at: PROSE.text.length,
    text: " Drafted by the assistant.",
    provenance: { origin: "AI", runId: "r1", timestamp: TS },
  });
  return must(r.ok ? { ok: true, value: r.value.document } : r);
})();

/** An Other_Reference (`[REF]`). */
const REFERENCE = fromText("See 42 U.S.C. § 1983 here.");

/** An unlisted LEXIS Database_Citation with no Short_Form. */
const LEXIS = fromText("See 2020 Zed LEXIS 5.");

const CASE_TEXT = 'Roe v. Wade, 410 U.S. 113 (1973) ("hello world").';

/** A verified Full_Citation with an attached quote: two keyed Codes, `CIT ✓` and `QUO …`. */
const CASE_QUOTE = (() => {
  const doc = fromText(CASE_TEXT);
  return must(setVerification(doc, keyAt(doc, 0), { status: "verified", clusterId: "c1" }));
})();

/** An ambiguous Full_Citation, with an `Id.` Short_Form that derives `ambiguous` from it. */
const SHORT_FORM = (() => {
  const doc = fromText(`${CASE_TEXT} Id. at 114.`);
  return must(
    setVerification(doc, keyAt(doc, 0), { status: "ambiguous", candidates: ["c1", "c2"] }),
  );
})();

export const TAMPER_WITNESSES: Readonly<Record<TamperKind, Document>> = {
  coverage_drop: PROSE,
  coverage_empty: EMPTY,
  canonical_split: PROSE,
  provenance_empty_run: AI_RUN,
  run_flip: AI_RUN,
  run_missing: AI_RUN,
  surrogate: PROSE,
  quote_prefix: CASE_QUOTE,
  short_code: SHORT_FORM,
  short_count: SHORT_FORM,
  unverifiable_lexis: LEXIS,
  ref_as_cit: REFERENCE,
  ref_override: REFERENCE,
  ref_payload: REFERENCE,
  override_nonissue: CASE_QUOTE,
  issue_key_counter: CASE_QUOTE,
  issue_key_duplicate: CASE_QUOTE,
  ref_missing: REFERENCE,
  ref_extra: REFERENCE,
  ref_moved: REFERENCE,
  cit_shifted: CASE_QUOTE,
  quo_extra: CASE_QUOTE,
  quo_removed: CASE_QUOTE,
};

/** A Document whose Full_Rendering has at least three cut points, for the multi-fault test. */
export const MULTI_FAULT_WITNESS: Document = fromText("Alpha beta gamma delta epsilon.");

/** The kinds of `kinds` whose witness in `witnesses` yields no arbitrary, in `kinds` order. */
export function missingWitnesses(
  kinds: readonly TamperKind[],
  witnesses: Readonly<Partial<Record<TamperKind, Document>>>,
): readonly TamperKind[] {
  return kinds.filter((k) => {
    const doc = witnesses[k];
    return doc === undefined || arbTamperOfKind(k, doc) === undefined;
  });
}
