import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  arbBadVerificationWrite,
  arbDocument,
  arbVerificationResult,
  fullRecordsOf,
  isUnlistedLexisRecord,
} from "../src/testing/arbitraries";
import type { BadVerificationWrite, FullRecord } from "../src/testing/arbitraries";
import type { EngineError } from "../src/errors";
import type { Document, IssueKey, VerificationResult } from "../src/types";
import { setVerification, verificationOf } from "../src/verification";
import { runs } from "./support/fc";

// Shared helpers for Properties 28 to 31 (design "Correctness Properties", [verification]).

/** A Document with a Full_Citation key and a result that Property 28 may write to it. */
type Case = Readonly<{ doc: Document; target: FullRecord; result: VerificationResult }>;

/**
 * A `verified` result on an unlisted LEXIS key is `not_verifiable` (Property 29),
 * so for those keys the result is drawn from the other statuses.
 */
const arbResultFor = (target: FullRecord): fc.Arbitrary<VerificationResult> =>
  isUnlistedLexisRecord(target)
    ? arbVerificationResult.filter((r) => r.status !== "verified")
    : arbVerificationResult;

const arbCase: fc.Arbitrary<Case> = arbDocument
  .filter((doc) => fullRecordsOf(doc).length > 0)
  .chain((doc) =>
    fc
      .constantFrom(...fullRecordsOf(doc))
      .chain((target) => arbResultFor(target).map((result): Case => ({ doc, target, result }))),
  );

/** Keys of the Short_Forms whose target is the Full_Citation starting at `start`. */
function linkedShortKeys(doc: Document, start: number): readonly IssueKey[] {
  const keys: IssueKey[] = [];
  for (const c of doc.citations) {
    if (c.kind !== "short") continue;
    const v = c.citation.value;
    if (v.kind === "short" && v.targetStart === start) keys.push(c.key);
  }
  return keys;
}

/** Every Full_Citation and Short_Form key of `doc`. */
const keyedKeys = (doc: Document): readonly IssueKey[] =>
  doc.citations.flatMap((c) => (c.kind === "other" ? [] : [c.key]));

describe("verification state  _Requirements: 12.4, 16.1, 16.6, 16.7_", () => {
  // Property 28
  it("P28 setVerification updates the citation and its Short_Forms only", () => {
    fc.assert(
      fc.property(arbCase, ({ doc, target, result }) => {
        const written = setVerification(doc, target.key, result);
        if (!written.ok) throw new Error(`write rejected: ${JSON.stringify(written.error)}`);
        const next = written.value;
        const linked = linkedShortKeys(doc, target.citation.start);
        const affected = new Set<IssueKey>([target.key, ...linked]);

        // The citation and every linked Short_Form report the written result.
        for (const k of affected) expect(verificationOf(next, k)).toEqual(result);
        // Every other citation reports what it reported before.
        for (const k of keyedKeys(doc).filter((k) => !affected.has(k))) {
          expect(verificationOf(next, k)).toEqual(verificationOf(doc, k));
        }
        // Text, spans, runs, quotes, and counters are untouched.
        expect(next.text).toBe(doc.text);
        expect(next.spans).toEqual(doc.spans);
        expect(next.runs).toEqual(doc.runs);
        expect(next.quotes).toEqual(doc.quotes);
        expect(next.keyCounter).toBe(doc.keyCounter);
        expect(next.citations.map((c) => c.citation)).toEqual(doc.citations.map((c) => c.citation));
        // The Override on the key survives exactly when the status is unchanged.
        const before = doc.overrides.find((o) => o.key === target.key);
        const after = next.overrides.find((o) => o.key === target.key);
        expect(after).toEqual(target.result.status === result.status ? before : undefined);
        // Other keys' Overrides are kept, in order.
        const others = (d: Document) => d.overrides.filter((o) => o.key !== target.key);
        expect(others(next)).toEqual(others(doc));
      }),
      runs(),
    );
  }, 120_000);
});

/** The Engine_Error a bad write is expected to produce, from the recorded fault. */
function expectedError(w: BadVerificationWrite): EngineError {
  const { kind, field } = w.expected;
  if (kind === "invalid_verification_result") {
    return { kind, field: field ?? "" };
  }
  return { kind, key: w.key };
}

describe("invalid verification writes  _Requirements: 16.2, 16.3, 16.4, 16.5_", () => {
  // Property 29
  it("P29 invalid verification writes are rejected without change", () => {
    const arbBad = arbDocument.chain((doc) =>
      arbBadVerificationWrite(doc).map((write) => ({ doc, write })),
    );
    fc.assert(
      fc.property(arbBad, ({ doc, write }) => {
        const before = structuredClone(doc);
        const r = setVerification(doc, write.key, write.result);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.error).toEqual(expectedError(write));
        expect(doc).toEqual(before);
      }),
      runs(),
    );
  }, 120_000);
});
