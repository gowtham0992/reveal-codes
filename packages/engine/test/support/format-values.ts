/**
 * Value helpers for Properties 21 and 22 in format.properties.test.ts: the
 * LEXIS flag probe, and the non-Full_Citation values (Short_Form and Other)
 * that `format` must reject at `kind`. Kept here so
 * format.properties.test.ts stays under the 300-line module limit.
 */
import fc from "fast-check";
import { arbReporter, arbShortFormParty } from "../../src/testing/arbitraries";
import type { CitationValue, IdValue, OtherValue, PartyValue } from "../../src/types";

/** The LEXIS flag and whether the key is present at all (a WL value has none). */
export const lexisFlagOf = (v: CitationValue): Readonly<{ present: boolean; flag: unknown }> =>
  v.kind === "database"
    ? { present: "lexisCourtListed" in v, flag: v.lexisCourtListed }
    : { present: false, flag: undefined };

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
export type Rejection = Readonly<{ value: CitationValue; field: string }>;

/** Short_Form and Other values all fail at the first A13 step, `kind`. */
export const arbNonFullCase: fc.Arbitrary<Rejection> = fc
  .oneof(arbIdValue, arbPartyValue, arbOtherValue)
  .map((value) => ({ value, field: "kind" }));
