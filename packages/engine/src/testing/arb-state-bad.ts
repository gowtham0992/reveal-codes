/**
 * Bad state writes (design "Arbitraries" table, D22; Properties 29 and 31;
 * Req 16.2 to 16.5, 17.3, 17.5, 17.8). Each value records the error the
 * Engine must return at generation time, never inferred from the Engine.
 * Malformed payloads are built as `unknown` and cast once, here, because the
 * Engine's writers accept untrusted data at runtime.
 */
import fc from "fast-check";
import type { Document, IssueKey, QuoteCheckResult, VerificationResult } from "../types.js";
import { arbBadTimestamp } from "./arb-bad-timestamp.js";
import {
  arbQuoteCheckResult,
  arbVerificationResult,
  arbVerifiedResult,
  fullRecordsOf,
  isUnlistedLexisRecord,
} from "./arb-state.js";

const asVerification = (v: unknown): VerificationResult => v as VerificationResult;
const asQuote = (v: unknown): QuoteCheckResult => v as QuoteCheckResult;

/** The expected error of a bad verification write (Req 16.2 to 16.5). */
export type VerificationFault = Readonly<{
  kind: "unknown_citation" | "not_verifiable" | "invalid_verification_result";
  /** Present for `invalid_verification_result`: the first failing field. */
  field?: string;
}>;

export type BadVerificationWrite = Readonly<{
  key: IssueKey;
  result: VerificationResult;
  expected: VerificationFault;
}>;

type Malformed = Readonly<{ result: VerificationResult; field: string; status: string }>;

const malformed = (status: string, field: string, v: unknown): Malformed => ({
  result: asVerification(v),
  field,
  status,
});

/** Malformed `verified` payloads: the cluster id is absent, empty, or not a string. */
const arbMalformedVerified: fc.Arbitrary<Malformed> = fc
  .constantFrom<unknown>(
    { status: "verified" },
    { status: "verified", clusterId: "" },
    { status: "verified", clusterId: 7 },
    { status: "verified", clusterId: null },
  )
  .map((v) => malformed("verified", "clusterId", v));

/** Malformed payloads of the other statuses, and an unknown status. */
const arbMalformedOther: fc.Arbitrary<Malformed> = fc.oneof(
  fc
    .constantFrom<unknown>(
      { status: "ambiguous" },
      { status: "ambiguous", candidates: [] },
      { status: "ambiguous", candidates: ["a"] },
      { status: "ambiguous", candidates: ["a", "a"] },
      { status: "ambiguous", candidates: ["a", ""] },
      { status: "ambiguous", candidates: [1, 2] },
      { status: "ambiguous", candidates: "ab" },
    )
    .map((v) => malformed("ambiguous", "candidates", v)),
  fc
    .constantFrom<unknown>({ status: "not_found", reason: "" }, { status: "not_found", reason: 5 })
    .map((v) => malformed("not_found", "reason", v)),
  fc
    .oneof(arbBadTimestamp, fc.constantFrom<unknown>(5, null))
    .map((waitUntil) => malformed("unchecked", "waitUntil", { status: "unchecked", waitUntil })),
  fc
    .constantFrom<unknown>({}, { status: "bogus" }, { status: 3 })
    .map((v) => malformed("other", "status", v)),
);

const arbAnyResult: fc.Arbitrary<VerificationResult> = fc.oneof(
  arbVerificationResult,
  arbMalformedVerified.map((m) => m.result),
  arbMalformedOther.map((m) => m.result),
);

/** A key no Document has: Issue_Keys are `k<n>`. */
const arbUnknownKey: fc.Arbitrary<string> = fc.nat().map((n) => `u${String(n)}`);

function withFault(
  key: fc.Arbitrary<IssueKey>,
  result: fc.Arbitrary<VerificationResult>,
  expected: VerificationFault,
): fc.Arbitrary<BadVerificationWrite> {
  return fc
    .tuple(key, result)
    .map(([k, r]): BadVerificationWrite => ({ key: k, result: r, expected }));
}

function withMalformed(
  keys: readonly IssueKey[],
  bad: fc.Arbitrary<Malformed>,
): fc.Arbitrary<BadVerificationWrite> {
  return fc.tuple(fc.constantFrom(...keys), bad).map(([key, m]): BadVerificationWrite => ({
    key,
    result: m.result,
    expected: { kind: "invalid_verification_result", field: m.field },
  }));
}

/**
 * Verification writes the Engine must reject, with the fault recorded: an
 * unknown key, a Short_Form key, a `verified` write (well-formed or
 * malformed) on an unlisted LEXIS key (all `not_verifiable`), and a
 * malformed payload on a key where `not_verifiable` does not apply.
 */
export function arbBadVerificationWrite(doc: Document): fc.Arbitrary<BadVerificationWrite> {
  const fulls = fullRecordsOf(doc);
  const unlisted = fulls.filter(isUnlistedLexisRecord).map((r) => r.key);
  const listed = fulls.filter((r) => !isUnlistedLexisRecord(r)).map((r) => r.key);
  const shorts = doc.citations.flatMap((r) => (r.kind === "short" ? [r.key] : []));
  const options: fc.Arbitrary<BadVerificationWrite>[] = [
    withFault(arbUnknownKey, arbAnyResult, { kind: "unknown_citation" }),
  ];
  if (shorts.length > 0) {
    options.push(withFault(fc.constantFrom(...shorts), arbAnyResult, { kind: "not_verifiable" }));
  }
  if (unlisted.length > 0) {
    const verified = fc.oneof(
      arbVerifiedResult,
      arbMalformedVerified.map((m) => m.result),
    );
    options.push(withFault(fc.constantFrom(...unlisted), verified, { kind: "not_verifiable" }));
  }
  if (listed.length > 0) options.push(withMalformed(listed, arbMalformedVerified));
  if (fulls.length > 0)
    options.push(
      withMalformed(
        fulls.map((r) => r.key),
        arbMalformedOther,
      ),
    );
  return fc.oneof(...options);
}

/** The expected error of a bad quote-check write (Req 13.4, 17.3, 17.5, 17.8). */
export type QuoteFault =
  | Readonly<{ kind: "unknown_quote" | "not_verifiable" }>
  | Readonly<{ kind: "invalid_quote_result"; field: "prefixLength"; value: unknown }>;

export type BadQuoteWrite = Readonly<{
  key: IssueKey;
  result: QuoteCheckResult;
  expected: QuoteFault;
}>;

/** True when the quote at `citationStart` attaches to an Orphan Short_Form. */
function attachedToOrphan(doc: Document, citationStart: number): boolean {
  const c = doc.citations.find((r) => r.citation.start === citationStart);
  if (c === undefined || c.kind !== "short") return false;
  return c.citation.value.kind === "short" && c.citation.value.targetStart === null;
}

/** Invalid `prefixLength` values for a quote of `len` code units. */
function arbBadPrefix(len: number): fc.Arbitrary<unknown> {
  return fc.oneof(
    fc.constantFrom<unknown>(0.5, 1.5, Number.NaN, Infinity, -Infinity, "1", null),
    fc.integer({ min: -1000, max: -1 }),
    fc.nat({ max: 1000 }).map((n) => len + n),
  );
}

const mismatchWith = (prefixLength: unknown): QuoteCheckResult =>
  asQuote({ status: "mismatch", prefixLength });

/**
 * Quote-check writes the Engine must reject: an unknown key
 * (`unknown_quote`), a quote on an Orphan with any result (`not_verifiable`,
 * which precedes the payload check), and a `mismatch` whose prefix is
 * non-integer, negative, or at least the quote length
 * (`invalid_quote_result`).
 */
export function arbBadQuoteWrite(doc: Document): fc.Arbitrary<BadQuoteWrite> {
  const unknown = fc
    .tuple(arbUnknownKey, arbQuoteCheckResult(5))
    .map(([key, result]): BadQuoteWrite => ({ key, result, expected: { kind: "unknown_quote" } }));
  if (doc.quotes.length === 0) return unknown;
  const onQuote = fc.constantFrom(...doc.quotes).chain((q) => {
    const len = q.quote.end - q.quote.start;
    const bad = arbBadPrefix(len).map((value) => ({ result: mismatchWith(value), value }));
    if (attachedToOrphan(doc, q.quote.citationStart)) {
      const any = fc.oneof(
        arbQuoteCheckResult(len),
        bad.map((b) => b.result),
      );
      return any.map((result): BadQuoteWrite => ({
        key: q.key,
        result,
        expected: { kind: "not_verifiable" },
      }));
    }
    return bad.map(({ result, value }): BadQuoteWrite => ({
      key: q.key,
      result,
      expected: { kind: "invalid_quote_result", field: "prefixLength", value },
    }));
  });
  return fc.oneof(unknown, onQuote);
}
