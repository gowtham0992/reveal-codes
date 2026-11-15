/**
 * Verification-state arbitraries (design "Arbitraries" table, D22; Req 22.1,
 * 22.4): `arbVerificationResult`, `arbQuoteCheckResult(len)`, `arbReason`,
 * `arbBlankReason`, and `arbStateWrites`. Bad writes are in
 * `arb-state-bad.ts` and op interleavings in `arb-state-seq.ts`. Built only
 * from fast-check combinators, so every value shrinks. A write is applied
 * through the Engine's own setters; a write that returns an error is
 * skipped, never filtered out of the generator.
 */
import fc from "fast-check";
import type { EngineError } from "../errors.js";
import { issues, recordOverride } from "../issues.js";
import type { Result } from "../result.js";
import type {
  CitationRecord,
  Document,
  IssueKey,
  QuoteCheckResult,
  VerificationResult,
} from "../types.js";
import { setQuoteCheck, setVerification } from "../verification.js";
import { arbWrongCaseResult } from "./arb-case-match.js";
import { arbTimestamp } from "./arb-text.js";

/** A Full_Citation record of a Document. */
export type FullRecord = Extract<CitationRecord, { kind: "full" }>;

/** The Full_Citation records of `doc`, in Document order. */
export const fullRecordsOf = (doc: Document): readonly FullRecord[] =>
  doc.citations.filter((r): r is FullRecord => r.kind === "full");

/** True for a Database_Citation whose LEXIS court is not on the list (Req 16.5). */
export const isUnlistedLexisRecord = (r: FullRecord): boolean =>
  r.citation.value.kind === "database" && r.citation.value.lexisCourtListed === false;

/** One state write: a verification result, a quote-check result, or an Override. */
export type StateWrite =
  | Readonly<{ kind: "verification"; key: IssueKey; result: VerificationResult }>
  | Readonly<{ kind: "quote"; key: IssueKey; result: QuoteCheckResult }>
  | Readonly<{ kind: "override"; key: IssueKey; reason: string; timestamp: string }>;

/** Applies `w` through the Engine's setter for its kind. */
export function applyStateWrite(doc: Document, w: StateWrite): Result<Document, EngineError> {
  if (w.kind === "verification") return setVerification(doc, w.key, w.result);
  if (w.kind === "quote") return setQuoteCheck(doc, w.key, w.result);
  return recordOverride(doc, w.key, w.reason, w.timestamp);
}

/** Applies `writes` in order; a write that returns an error is skipped. */
export const applyStateWrites = (doc: Document, writes: readonly StateWrite[]): Document =>
  writes.reduce((d, w) => {
    const r = applyStateWrite(d, w);
    return r.ok ? r.value : d;
  }, doc);

const arbId: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 8 });

/** Well-formed `verified` results (non-empty cluster id). */
export const arbVerifiedResult: fc.Arbitrary<VerificationResult> = arbId.map((clusterId) => ({
  status: "verified",
  clusterId,
}));

/** Well-formed results of all five statuses, equally weighted (Req 16.2; case-match Req 13.3). */
export const arbVerificationResult: fc.Arbitrary<VerificationResult> = fc.oneof(
  arbVerifiedResult,
  arbWrongCaseResult,
  fc
    .uniqueArray(arbId, { minLength: 2, maxLength: 5 })
    .map((candidates): VerificationResult => ({ status: "ambiguous", candidates })),
  fc
    .option(arbId, { nil: undefined })
    .map((reason): VerificationResult =>
      reason === undefined ? { status: "not_found" } : { status: "not_found", reason },
    ),
  fc
    .option(arbTimestamp, { nil: undefined })
    .map((waitUntil): VerificationResult =>
      waitUntil === undefined ? { status: "unchecked" } : { status: "unchecked", waitUntil },
    ),
);

/** Well-formed quote-check results for a quote of `len` code units: `mismatch` prefix in [0, len). */
export function arbQuoteCheckResult(len: number): fc.Arbitrary<QuoteCheckResult> {
  const plain = fc.constantFrom<QuoteCheckResult>({ status: "unchecked" }, { status: "match" });
  if (len < 1) return plain;
  const mismatch = fc
    .integer({ min: 0, max: len - 1 })
    .map((prefixLength): QuoteCheckResult => ({ status: "mismatch", prefixLength }));
  return fc.oneof(plain, mismatch);
}

const arbVisible: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom("[", "]", "\\", "{", "}", ";", "=", ","),
  fc.constantFrom("a", "Z", "9", "é", ".", "-", ":", "'", '"'),
  fc.string({ minLength: 1, maxLength: 1 }).filter((c) => c.trim() !== ""),
);

const arbSpace: fc.Arbitrary<string> = fc.constantFrom(" ", "\t", "\n", "\r", "\u00a0", "\u2003");

/** Reasons with `trim() !== ""`, including `[ ] \ { } ; = ,` and edge whitespace (Req 18.4). */
export const arbReason: fc.Arbitrary<string> = fc
  .tuple(
    fc.array(arbSpace, { maxLength: 2 }),
    arbVisible,
    fc.array(fc.oneof(arbVisible, arbSpace), { maxLength: 30 }),
    fc.array(arbSpace, { maxLength: 2 }),
  )
  .map(([lead, first, body, trail]) => [...lead, first, ...body, ...trail].join(""));

/** Whitespace-only reasons, including the empty string (Req 18.5). */
export const arbBlankReason: fc.Arbitrary<string> = fc
  .array(arbSpace, { maxLength: 6 })
  .map((cs) => cs.join(""));

type Weighted<T> = Readonly<{ arbitrary: fc.Arbitrary<T>; weight: number }>;

/** Weighted generators of writes that are well-formed against `doc`'s keys. */
export function stateWriteOptions(doc: Document): readonly Weighted<StateWrite>[] {
  const out: Weighted<StateWrite>[] = [];
  const fulls = fullRecordsOf(doc).map((r) => r.key);
  if (fulls.length > 0) {
    const arbitrary = fc
      .tuple(fc.constantFrom(...fulls), arbVerificationResult)
      .map(([key, result]): StateWrite => ({ kind: "verification", key, result }));
    out.push({ arbitrary, weight: 4 });
  }
  if (doc.quotes.length > 0) {
    const arbitrary = fc.constantFrom(...doc.quotes).chain((q) =>
      arbQuoteCheckResult(q.quote.end - q.quote.start).map((result): StateWrite => ({
        kind: "quote",
        key: q.key,
        result,
      })),
    );
    out.push({ arbitrary, weight: 3 });
  }
  const arbitrary = arbOverrideWrite(doc);
  if (arbitrary !== null) out.push({ arbitrary, weight: 3 });
  return out;
}

/** An Override write, mostly on a current Issue key, sometimes on any key. */
function arbOverrideWrite(doc: Document): fc.Arbitrary<StateWrite> | null {
  const current = issues(doc).map((i) => i.key);
  const all = [...fullRecordsOf(doc).map((r) => r.key), ...doc.quotes.map((q) => q.key)];
  const keys = current.length === 0 ? all : current;
  if (keys.length === 0) return null;
  const arbKey = fc.oneof(
    { arbitrary: fc.constantFrom(...keys), weight: 3 },
    fc.constantFrom(...all, ...keys),
  );
  return fc
    .tuple(arbKey, arbReason, arbTimestamp)
    .map(([key, reason, timestamp]): StateWrite => ({ kind: "override", key, reason, timestamp }));
}

/**
 * 0 to 12 state writes against `doc`: verification results for its
 * Full_Citation keys (all four statuses), quote results (all three), and
 * Overrides with `arbReason`. Keys never change under state writes, so the
 * keys of `doc` stay valid targets for the whole list.
 */
export function arbStateWrites(doc: Document): fc.Arbitrary<readonly StateWrite[]> {
  const options = stateWriteOptions(doc);
  if (options.length === 0) return fc.constant([]);
  return fc.array(fc.oneof(...options), { maxLength: 12 });
}
