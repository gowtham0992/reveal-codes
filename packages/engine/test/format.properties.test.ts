import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { format, validateFullValue } from "../src/citations/format";
import { scanRange } from "../src/citations/scan";
import { structuralEqual } from "../src/equal";
import {
  arbCitation,
  arbReporter,
  arbShortFormParty,
  arbValueCorruption,
} from "../src/testing/arbitraries";
import type { CitationValue, FullValue, IdValue, OtherValue, PartyValue } from "../src/types";
import { runs } from "./support/fc";

// Properties 21 and 22 (design "Correctness Properties", [format]).

/** The Quotation_Pair marks (Req 13.1 glossary); text without them has no Quote_Candidate. */
const QUOTE_MARKS = /["\u201C\u201D]/;

describe("Property 21: Canonical format round trips and is idempotent _Requirements: 10.1, 10.2, 10.3, 10.4, 11.2, 14.3, 14.5_", () => {
  it("scanning format(c) yields exactly c over the whole string, and format of that value is format(c)", () => {
    // Property 21
    // Feature: provenance-engine, Property 21: Canonical format round trips and is idempotent
    //
    // `extract` (task 5.19) does not exist yet, so this reads `format(c)` back
    // with `scanRange`, the match layer `extract` is built on. The two
    // `extract`-only clauses are checked through their definitions:
    // Normalised_Form is `format(value)` set only when it differs from the
    // text as written (design A9), so `format(value) === text` means none;
    // a Quote_Candidate needs a Quotation_Pair, so text with no quotation
    // mark has none. Switch to `extract(text)` when task 5.19 lands.
    fc.assert(
      fc.property(arbCitation, (c) => {
        const formatted = format(c);
        expect(formatted.ok).toBe(true);
        if (!formatted.ok) return;
        const text = formatted.value;

        const matches = scanRange(text, 0, () => false);
        expect(matches).toHaveLength(1);
        const [m] = matches;
        if (m === undefined) return;
        expect([m.start, m.end]).toEqual([0, text.length]);
        expect(structuralEqual(m.value, c)).toBe(true);
        expect(m.normalised).toBeUndefined();
        expect(QUOTE_MARKS.test(text)).toBe(false);

        const again = format(m.value);
        expect(again.ok && again.value === text).toBe(true);
      }),
      runs(),
    );
  });

  // Shrunk counterexample (seed 842338267, path "61:2:1:0:0:0:0:0:3:3:3:3:3").
  // `1600 Phila. Ct. Com. Pl. LEXIS 1` used to be both a Reporter_Citation
  // (194 Reporter_List entries ended in ` LEXIS`) and a Database_Citation, so
  // the reporter value did not round trip. Req 14.7 resolved the collision by
  // dropping every database citation form from the Reporter_List: the reporter
  // value is now invalid and the string reads only as the Database_Citation.
  it("counterexample: `1600 Phila. Ct. Com. Pl. LEXIS 1` is a Database_Citation, not a reporter", () => {
    const asReporter: FullValue = {
      kind: "reporter",
      volume: 1600,
      reporter: "Phila. Ct. Com. Pl. LEXIS",
      page: 1,
    };
    expect(format(asReporter)).toEqual({
      ok: false,
      error: { kind: "invalid_citation", field: "reporter" },
    });

    const text = "1600 Phila. Ct. Com. Pl. LEXIS 1";
    const asDatabase: FullValue = {
      kind: "database",
      year: 1600,
      designator: "LEXIS",
      lexisCourt: "Phila. Ct. Com. Pl.",
      number: 1,
    };
    const matches = scanRange(text, 0, () => false);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ start: 0, end: text.length });
    expect(matches[0]?.value).toEqual(asDatabase);
    expect(format(asDatabase)).toEqual({ ok: true, value: text });
  });
});

/** Optional fields: absent or present with the arbitrary's value. */
const opt = <T>(a: fc.Arbitrary<T>): fc.Arbitrary<T | undefined> =>
  fc.option(a, { nil: undefined });

const arbTargetStart = fc.option(fc.nat({ max: 10_000 }), { nil: null });

const arbIdValue: fc.Arbitrary<IdValue> = fc
  .record({ pincite: opt(fc.integer({ min: 1, max: 99_999 })), targetStart: arbTargetStart })
  .map(({ pincite, targetStart }) => {
    const base = { kind: "short", form: "id", targetStart } as const;
    return pincite === undefined ? base : { ...base, pincite };
  });

const arbPartyValue: fc.Arbitrary<PartyValue> = fc.record({
  kind: fc.constant("short" as const),
  form: fc.constant("party" as const),
  party: arbShortFormParty,
  volume: fc.integer({ min: 1, max: 99_999 }),
  reporter: arbReporter,
  pincite: fc.integer({ min: 1, max: 99_999 }),
  targetStart: arbTargetStart,
});

const arbOtherValue: fc.Arbitrary<OtherValue> = fc
  .record({
    form: fc.constantFrom("usc" as const, "cfr" as const, "fed_rule" as const),
    title: opt(fc.integer({ min: 1, max: 99 })),
    section: fc.stringMatching(/^[0-9]{1,5}[a-z]?$/),
  })
  .map(({ form, title, section }) => {
    const base = { kind: "other", form, section } as const;
    return title === undefined ? base : { ...base, title };
  });

/** A value that `format` must reject, and the field it must name. */
type Rejection = Readonly<{ value: CitationValue; field: string }>;

/** Short_Form and Other values all fail at the first A13 step, `kind`. */
const arbNonFullCase: fc.Arbitrary<Rejection> = fc
  .oneof(arbIdValue, arbPartyValue, arbOtherValue)
  .map((value) => ({ value, field: "kind" }));

describe("Property 22: Invalid citation values are rejected at the first failing field _Requirements: 10.5_", () => {
  it("validateFullValue and format both return invalid_citation naming the recorded field", () => {
    const cases: fc.Arbitrary<Rejection> = fc.oneof(arbValueCorruption, arbNonFullCase);
    // Property 22
    // Feature: provenance-engine, Property 22: Invalid citation values are rejected at the first failing field
    //
    // `arbValueCorruption` breaks exactly one field of an `arbCitation` value,
    // so the recorded field is the first failure in A13 order. Short_Form and
    // Other values are not Full_Citations and fail at `kind`, the first step.
    fc.assert(
      fc.property(cases, ({ value, field }) => {
        const expected = { ok: false, error: { kind: "invalid_citation", field } };
        expect(validateFullValue(value)).toEqual(expected);
        expect(format(value)).toEqual(expected);
      }),
      runs(),
    );
  });
});
