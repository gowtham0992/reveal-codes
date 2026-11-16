import {
  createDocument,
  issues,
  recordOverride,
  setQuoteCheck,
  setVerification,
} from "@reveal-codes/engine";
import type { Document, QuoteCheckResult, VerificationResult } from "@reveal-codes/engine";
import { canExport } from "@reveal-codes/export";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { needsCheckDate } from "../src/client/check-date";
import { countVerifiableUnchecked, runVerifyFlow } from "../src/client/verify-flow";
import { nextStep } from "../src/components/next-step";
import { arbCitingDocument, arbNextStepInput } from "./arbitraries";
import { fakeVerifyApi, restoredStore } from "./support/check-date-fixtures";
import { runs } from "./support/fc";

const NOW = (): Date => new Date("2026-11-07T12:00:00.000Z");

type Case = Readonly<{ document: Document; withResult: boolean; hasFull: boolean }>;

/** A Document with a full citation (and a result on its first one, or none) or plain prose. */
const arbGapDocument: fc.Arbitrary<Case> = fc
  .tuple(arbCitingDocument, fc.boolean(), fc.boolean())
  .map(([cited, withResult, citing]) => {
    if (!citing) {
      const plain = createDocument(
        "Plain prose with no citation at all.",
        "2024-01-01T00:00:00.000Z",
      );
      if (!plain.ok) throw new Error(`createDocument failed: ${plain.error.kind}`);
      return { document: plain.value, withResult: false, hasFull: false };
    }
    const first = cited.citations.find((c) => c.kind === "full");
    if (!withResult || first === undefined)
      return { document: cited, withResult: false, hasFull: true };
    const set = setVerification(cited, first.key, { status: "not_found" });
    if (!set.ok) throw new Error(`setVerification failed: ${set.error.kind}`);
    return { document: set.value, withResult: true, hasFull: true };
  });

type Step = ReturnType<typeof nextStep>;

/** The rule before open-draft, as a table: key is verifying, empty, verifiableUnchecked above 0. */
const OLD_RULE: Readonly<Record<string, Step>> = {
  "true,true,true": "none",
  "true,true,false": "none",
  "true,false,true": "none",
  "true,false,false": "none",
  "false,true,true": "load-demo",
  "false,true,false": "load-demo",
  "false,false,true": "verify",
  "false,false,false": "export",
};

describe("Property 6: outside the gap the Next_Step is unchanged _Requirements: 13.14_", () => {
  it("equals the pre-change rule table whenever needsCheckDate is false", () => {
    // Property 6
    fc.assert(
      fc.property(arbNextStepInput, (input) => {
        const outside = { ...input, needsCheckDate: false };
        const key = [outside.verifying, outside.empty, outside.verifiableUnchecked > 0]
          .map(String)
          .join(",");
        expect(nextStep(outside)).toBe(OLD_RULE[key]);
      }),
      { numRuns: runs() },
    );
  });
});

describe("Property 5: a missing check date makes Verify the next step _Requirements: 13.11, 13.13_", () => {
  it("gives verify in the gap whatever the counts, keeps the rule order, and ties the gap to verifiedAt", async () => {
    // Property 5
    await fc.assert(
      fc.asyncProperty(arbNextStepInput, arbGapDocument, fc.boolean(), async (input, c, dated) => {
        const gap = { ...input, needsCheckDate: true };
        if (input.verifying) expect(nextStep(gap)).toBe("none");
        else if (input.empty) expect(nextStep(gap)).toBe("load-demo");
        else expect(nextStep(gap)).toBe("verify");

        const store = restoredStore(c.document);
        if (dated) store.dispatch({ type: "verified", at: NOW().toISOString() });
        const expected = !dated && c.withResult && c.hasFull;
        expect(needsCheckDate(c.document, store.getState().verifiedAt)).toBe(expected);

        if (expected) {
          const fake = fakeVerifyApi();
          await runVerifyFlow(fake.api, store, NOW);
          expect(store.getState().verifiedAt).not.toBeNull();
          expect(needsCheckDate(store.getState().document, store.getState().verifiedAt)).toBe(
            false,
          );
        }
      }),
      { numRuns: runs() },
    );
  });
});

const arbCitationResult: fc.Arbitrary<VerificationResult> = fc.constantFrom(
  { status: "verified", clusterId: "c1" },
  { status: "wrong_case", clusterId: "c2", foundName: "Other v. Case" },
  { status: "ambiguous", candidates: ["c3", "c4"] },
  { status: "not_found" },
  { status: "unchecked" },
);

const arbQuoteResult: fc.Arbitrary<QuoteCheckResult> = fc.constantFrom(
  { status: "match" },
  { status: "mismatch", prefixLength: 0 },
  { status: "unchecked" },
);

type RedPlan = Readonly<{
  document: Document;
  citationResults: readonly VerificationResult[];
  quoteResults: readonly QuoteCheckResult[];
  overridden: readonly boolean[];
}>;

const arbRedPlan: fc.Arbitrary<RedPlan> = fc.record({
  document: arbCitingDocument,
  citationResults: fc.array(arbCitationResult, { maxLength: 8 }),
  quoteResults: fc.array(arbQuoteResult, { maxLength: 8 }),
  overridden: fc.array(fc.boolean(), { maxLength: 16 }),
});

/** Writes the planned results where the Engine accepts them, then overrides the picked issues. */
function applyPlan(plan: RedPlan): { document: Document; overriddenKeys: ReadonlySet<string> } {
  let doc = plan.document;
  const fulls = doc.citations.flatMap((c) => (c.kind === "full" ? [c.key] : []));
  fulls.forEach((key, i) => {
    const result = plan.citationResults[i];
    const set = result === undefined ? null : setVerification(doc, key, result);
    if (set !== null && set.ok) doc = set.value;
  });
  doc.quotes
    .map((q) => q.key)
    .forEach((key, i) => {
      const result = plan.quoteResults[i];
      const set = result === undefined ? null : setQuoteCheck(doc, key, result);
      if (set !== null && set.ok) doc = set.value;
    });
  const keys = new Set<string>();
  issues(doc).forEach((issue, i) => {
    if (plan.overridden[i] !== true) return;
    const set = recordOverride(doc, issue.key, "reason given", "2026-11-07T12:00:00.000Z");
    if (!set.ok) throw new Error(`recordOverride failed: ${set.error.kind}`);
    doc = set.value;
    keys.add(issue.key);
  });
  return { document: doc, overriddenKeys: keys };
}

describe("Property 7: red codes still block export while the Next_Step is Verify _Requirements: 13.12_", () => {
  it("makes canExport false exactly when an un-overridden red code remains, with or without a check date", () => {
    // Property 7
    fc.assert(
      fc.property(arbRedPlan, (plan) => {
        const { document, overriddenKeys } = applyPlan(plan);
        const blocked = issues(document).some((issue) => !overriddenKeys.has(issue.key));

        const gap = restoredStore(document);
        const gapState = gap.getState();
        const gapStep = nextStep({
          empty: gapState.document.text.length === 0,
          verifying: false,
          verifiableUnchecked: countVerifiableUnchecked(gapState.document),
          needsCheckDate: needsCheckDate(gapState.document, gapState.verifiedAt),
          blocking: 0,
        });
        const dated = restoredStore(document);
        dated.dispatch({ type: "verified", at: NOW().toISOString() });

        expect(canExport(gapState.document, null, null)).toBe(!blocked);
        expect(canExport(dated.getState().document, null, null)).toBe(!blocked);
        if (gapStep === "verify" && blocked) expect(canExport(document, null, null)).toBe(false);
        expect(gapState.document.overrides).toEqual(document.overrides);
      }),
      { numRuns: runs() },
    );
  });
});
