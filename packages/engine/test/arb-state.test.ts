import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { issues } from "../src/issues";
import { setQuoteCheck, setVerification } from "../src/verification";
import {
  applyStateStep,
  arbBadQuoteWrite,
  arbBadVerificationWrite,
  arbBlankReason,
  arbDocument,
  arbReason,
  arbStateOpSequence,
} from "../src/testing/arbitraries";
import { runs } from "./support/fc";

const arbDocWith = <T>(f: (d: Parameters<typeof setVerification>[0]) => fc.Arbitrary<T>) =>
  arbDocument.chain((doc) => f(doc).map((v) => ({ doc, v })));

describe("state arbitraries", () => {
  it("arbReason is non-blank and arbBlankReason is blank", () => {
    fc.assert(
      fc.property(arbReason, arbBlankReason, (r, b) => {
        expect(r.trim()).not.toBe("");
        expect(b.trim()).toBe("");
      }),
      runs(),
    );
  });

  it("arbDocument reaches every verification status", () => {
    const seen = new Set<string>();
    fc.assert(
      fc.property(arbDocument, (d) => {
        for (const c of d.citations) if (c.kind === "full") seen.add(c.result.status);
      }),
      { numRuns: 400 },
    );
    expect([...seen].sort()).toEqual(["ambiguous", "not_found", "unchecked", "verified"]);
  });

  it("bad verification writes return the recorded error and change nothing", () => {
    fc.assert(
      fc.property(arbDocWith(arbBadVerificationWrite), ({ doc, v }) => {
        const r = setVerification(doc, v.key, v.result);
        expect(r.ok).toBe(false);
        if (!r.ok) {
          expect(r.error.kind).toBe(v.expected.kind);
          if (r.error.kind === "invalid_verification_result") {
            expect(r.error.field).toBe(v.expected.field);
          }
        }
      }),
      runs(),
    );
  });

  it("bad quote writes return the recorded error", () => {
    fc.assert(
      fc.property(arbDocWith(arbBadQuoteWrite), ({ doc, v }) => {
        const r = setQuoteCheck(doc, v.key, v.result);
        expect(r.ok).toBe(false);
        if (!r.ok)
          expect(r.error).toEqual({
            ...v.expected,
            ...(r.error.kind === "unknown_quote" || r.error.kind === "not_verifiable"
              ? { key: v.key }
              : {}),
          });
      }),
      runs(),
    );
  });

  it("state sequences never verify an unlisted LEXIS citation", () => {
    fc.assert(
      fc.property(
        arbDocWith((d) => arbStateOpSequence(d)),
        ({ doc, v }) => {
          let d = doc;
          for (const step of v) {
            const r = applyStateStep(d, step);
            if (step.kind === "write" && step.expectNotVerifiable) {
              expect(r.ok).toBe(false);
            }
            if (r.ok) d = r.value;
            for (const c of d.citations) {
              if (c.kind === "full" && c.citation.value.kind === "database") {
                if (c.citation.value.lexisCourtListed === false) {
                  expect(c.result.status).not.toBe("verified");
                }
              }
            }
            const keys = new Set(issues(d).map((i) => i.key));
            for (const o of d.overrides) expect(keys.has(o.key)).toBe(true);
          }
        },
      ),
      runs(),
    );
  });
});
