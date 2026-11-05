import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { format, validateFullValue } from "../src/citations/format";
import { isCourtText } from "../src/citations/grammar";
import { collapseReporter, lookupReporter, REPORTERS } from "../src/citations/reporters";
import {
  arbCitation,
  arbCourt,
  arbGarbageCitation,
  arbNearMissCitation,
  arbValueCorruption,
} from "../src/testing/arbitraries";
import { runs } from "./support/fc";

describe("citation arbitraries meet their definitions _Requirements: 22.1, 22.4_", () => {
  it("arbCourt values satisfy the tightened court rule", () => {
    fc.assert(
      fc.property(arbCourt, (c) => {
        expect(isCourtText(c)).toBe(true);
      }),
      runs(),
    );
  });

  it("arbCitation values pass validateFullValue unchanged", () => {
    fc.assert(
      fc.property(arbCitation, (c) => {
        expect(validateFullValue(c)).toEqual({ ok: true, value: c });
      }),
      runs(),
    );
  });

  it("arbValueCorruption is rejected at its recorded field", () => {
    fc.assert(
      fc.property(arbValueCorruption, ({ value, field }) => {
        expect(validateFullValue(value)).toEqual({
          ok: false,
          error: { kind: "invalid_citation", field },
        });
      }),
      runs(),
    );
  });

  it("arbNearMissCitation expects the first collapsed entry and differs from its canonical form", () => {
    fc.assert(
      fc.property(arbNearMissCitation, ({ text, token, value }) => {
        const first = REPORTERS.find((e) => collapseReporter(e) === collapseReporter(token));
        expect(REPORTERS.includes(token)).toBe(false);
        expect(value.reporter).toBe(first);
        expect(lookupReporter(token)).toBe(value.reporter);
        const canonical = format(value);
        expect(canonical.ok).toBe(true);
        expect(canonical.ok && canonical.value).not.toBe(text);
        expect(text).toBe(`${String(value.volume)} ${token} ${String(value.page)}`);
      }),
      runs(),
    );
  });

  it("arbGarbageCitation tokens resolve neither exactly nor collapsed", () => {
    fc.assert(
      fc.property(arbGarbageCitation, (g) => {
        const token = g.slice(g.indexOf(" ") + 1, g.lastIndexOf(" "));
        expect(token).not.toMatch(/\d/);
        expect(lookupReporter(token)).toBeNull();
      }),
      runs(),
    );
  });
});
