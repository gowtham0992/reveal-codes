import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { format, validateFullValue } from "../src/citations/format";
import { isCourtText } from "../src/citations/grammar";
import {
  isUnlistedLexisCourt,
  LEXIS_COURTS,
  lexisCollapsedIndex,
} from "../src/citations/lexis-courts";
import { collapseReporter, lookupReporter, REPORTERS } from "../src/citations/reporters";
import {
  arbCitation,
  arbCourt,
  arbDatabaseValue,
  arbLexisCourt,
  arbNearMissLexisCourt,
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

  it("arbLexisCourt gives exact entries when listed and readable unlisted courts otherwise", () => {
    fc.assert(
      fc.property(arbLexisCourt, ({ lexisCourtListed, lexisCourt }) => {
        if (lexisCourtListed) {
          expect(LEXIS_COURTS).toContain(lexisCourt);
          return;
        }
        expect(isUnlistedLexisCourt(lexisCourt)).toBe(true);
        expect(isGlossaryUnlisted(lexisCourt)).toBe(true);
      }),
      runs(),
    );
  });

  it("arbDatabaseValue yields WL, listed, and unlisted values", () => {
    const seen = new Set(
      fc
        .sample(arbDatabaseValue, { numRuns: 500, seed: 1 })
        .map((v) => (v.designator === "WL" ? "WL" : String(v.lexisCourtListed))),
    );
    expect([...seen].sort()).toEqual(["WL", "false", "true"]);
  });

  it("arbNearMissLexisCourt is a collapsed match that is not an entry", () => {
    fc.assert(
      fc.property(arbNearMissLexisCourt, (c) => {
        expect(LEXIS_COURTS).not.toContain(c);
        expect(lexisCollapsedIndex.has(collapseReporter(c))).toBe(true);
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

  it("arbGarbageCitation tokens resolve neither exactly nor collapsed and contain no word Id. (D24)", () => {
    fc.assert(
      fc.property(arbGarbageCitation, (g) => {
        const token = g.slice(g.indexOf(" ") + 1, g.lastIndexOf(" "));
        expect(token).not.toMatch(/\d/);
        expect(lookupReporter(token)).toBeNull();
        expect(token.split(" ")).not.toContain("Id.");
      }),
      runs(),
    );
  });
});

/** Test-local Glossary Unlisted_Lexis_Court checker (design P43), apart from the list lookup. */
function isGlossaryUnlisted(c: string): boolean {
  const tokens = c.split(" ");
  const tokenOk = (t: string): boolean =>
    /^[A-Z0-9][^\s(),"“”]*$/.test(t) &&
    !(/^\d{4}$/.test(t) && +t >= 1600 && +t <= 2999) &&
    t !== "LEXIS";
  return c.length >= 1 && c.length <= 40 && tokens[0] !== "WL" && tokens.every(tokenOk);
}
