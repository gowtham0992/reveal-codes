import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { extract } from "../src/citations/extract";
import { format, validateFullValue } from "../src/citations/format";
import { scanRange } from "../src/citations/scan";
import { structuralEqual } from "../src/equal";
import lexisCourtsJson from "../src/citations/lexis-courts.json" with { type: "json" };
import reportersJson from "../src/citations/reporters.json" with { type: "json" };
import {
  arbCitation,
  arbGarbageCitation,
  arbMember,
  arbNearMissCitation,
  arbNearMissLexisCitation,
  arbReporter,
  arbShortFormParty,
  arbTextWithCitations,
  arbValueCorruption,
} from "../src/testing/arbitraries";
import type {
  CitationValue,
  FullValue,
  IdValue,
  OtherValue,
  ParallelValue,
  PartyValue,
  ReporterMember,
} from "../src/types";
import { runs } from "./support/fc";
import { neutralPositions } from "./support/neutral";
import { p24Seed26608700 } from "./support/p24-seed-26608700";

// Properties 21 and 22 (design "Correctness Properties", [format]).

/** The LEXIS flag and whether the key is present at all (a WL value has none). */
const lexisFlagOf = (v: CitationValue): Readonly<{ present: boolean; flag: unknown }> =>
  v.kind === "database"
    ? { present: "lexisCourtListed" in v, flag: v.lexisCourtListed }
    : { present: false, flag: undefined };

describe("Property 21: Canonical format round trips and is idempotent _Requirements: 10.1, 10.2, 10.3, 10.4, 11.2, 14.3, 14.5_", () => {
  it("extracting format(c) yields exactly c over the whole string, keeping lexisCourtListed, and format of that value is format(c)", () => {
    // Property 21
    // Feature: provenance-engine, Property 21: Canonical format round trips and is idempotent
    //
    // `arbCitation` covers LEXIS values with listed courts
    // (`lexisCourtListed: true`) and unlisted courts (`false`). Value equality
    // includes the flag, so the round trip keeps it; the flag check below
    // states that directly.
    fc.assert(
      fc.property(arbCitation, (c) => {
        const formatted = format(c);
        expect(formatted.ok).toBe(true);
        if (!formatted.ok) return;
        const text = formatted.value;

        const { citations, quotes } = extract(text);
        expect(citations).toHaveLength(1);
        const [m] = citations;
        if (m === undefined) return;
        expect([m.start, m.end]).toEqual([0, text.length]);
        expect(structuralEqual(m.value, c)).toBe(true);
        expect(lexisFlagOf(m.value)).toEqual(lexisFlagOf(c));
        expect(m.normalised).toBeUndefined();
        expect(quotes).toEqual([]);

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
      lexisCourtListed: true,
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
  it("validateFullValue and format both return invalid_citation naming the recorded field, including LEXIS flag and court-consistency corruptions", () => {
    const cases: fc.Arbitrary<Rejection> = fc.oneof(arbValueCorruption, arbNonFullCase);
    // Property 22
    // Feature: provenance-engine, Property 22: Invalid citation values are rejected at the first failing field
    //
    // `arbValueCorruption` breaks exactly one field of an `arbCitation` value,
    // so the recorded field is the first failure in A13 order. Short_Form and
    // Other values are not Full_Citations and fail at `kind`, the first step.
    //
    // The corruptions include breaking the consistency between
    // `lexisCourtListed` and `lexisCourt` (A13, D22): the flag removed or
    // non-boolean on a LEXIS value, or present on a WL value, is rejected at
    // `lexisCourtListed`; `true` with a court that is not an exact list entry,
    // and `false` with a list entry, a collapsed match of one, or a court that
    // breaks the Unlisted_Lexis_Court rule, are rejected at `lexisCourt`.
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

// Property 23 (design "Correctness Properties", [format]).

/** Req 11.1's collapsed key, written out here so the oracle does not reuse the engine's. */
const collapseKey = (t: string): string => t.replace(/[. ]/g, "");

/** The first entry of `list`, in file order, whose collapsed key equals `token`'s (Req 9.4, 11.5). */
const firstListEntry = (list: readonly string[], token: string): string | undefined =>
  list.find((e) => collapseKey(e) === collapseKey(token));

const REPORTERS_JSON: readonly string[] = reportersJson;
const LEXIS_COURTS_JSON: readonly string[] = lexisCourtsJson;

/**
 * A near-miss case: the text as written, the near-miss token (a reporter or
 * a LEXIS court), the list entry the value records for it, the JSON list that
 * entry must come from, and the value the text must extract to.
 */
type NearMissCase = Readonly<{
  text: string;
  token: string;
  nmEntry: string;
  list: readonly string[];
  value: FullValue;
}>;

/** `<vol> <rep> <page>[, <pin>]`, the D1 layout of one parallel member. */
const memberText = (m: ReporterMember): string =>
  `${String(m.volume)} ${m.reporter} ${String(m.page)}` +
  (m.pincite === undefined ? "" : `, ${String(m.pincite)}`);

/** A near miss alone (Req 11.1, 11.4). */
const arbNearMissAlone: fc.Arbitrary<NearMissCase> = arbNearMissCitation.map((nm) => ({
  text: nm.text,
  token: nm.token,
  nmEntry: nm.value.reporter,
  list: REPORTERS_JSON,
  value: nm.value,
}));

/** A LEXIS Database_Citation whose court is a collapsed match of a list entry (Req 9.4). */
const arbNearMissLexis: fc.Arbitrary<NearMissCase> = arbNearMissLexisCitation.map((nm) => ({
  text: nm.text,
  token: nm.court,
  nmEntry: nm.value.lexisCourt ?? "",
  list: LEXIS_COURTS_JSON,
  value: nm.value,
}));

/**
 * A near miss as one member of a Parallel_Citation (Req 11.6): 1 to 3 exact
 * members, the near miss spliced in at index `at`, and an optional year.
 */
const arbNearMissParallel: fc.Arbitrary<NearMissCase> = fc
  .tuple(
    fc.array(arbMember, { minLength: 1, maxLength: 3 }),
    arbNearMissCitation,
    fc.nat(),
    fc.option(fc.integer({ min: 1600, max: 2999 }), { nil: undefined }),
  )
  .map(([exact, nm, at, year]) => {
    const i = at % (exact.length + 1);
    const nmMember: ReporterMember = {
      volume: nm.value.volume,
      reporter: nm.value.reporter,
      page: nm.value.page,
    };
    const members = [...exact.slice(0, i), nmMember, ...exact.slice(i)];
    const pieces = members.map((m, j) => (j === i ? nm.text : memberText(m)));
    const yearText = year === undefined ? "" : ` (${String(year)})`;
    const base = { kind: "parallel", members } as const;
    const value: ParallelValue = year === undefined ? base : { ...base, year };
    return {
      text: pieces.join(", ") + yearText,
      token: nm.token,
      nmEntry: nmMember.reporter,
      list: REPORTERS_JSON,
      value,
    };
  });

describe("Property 23: Near misses are extracted and normalised to the first matching reporter _Requirements: 9.4, 10.6, 11.1, 11.2, 11.4, 11.5, 11.6, 14.6_", () => {
  it("a near miss alone, as a parallel member, or as a near-miss LEXIS court extracts as written, to the first collapsed list entry, with Normalised_Form format(value) that re-extracts plainly, and repeats identically", () => {
    // Property 23
    // Feature: provenance-engine, Property 23: Near misses are extracted and normalised to the first matching reporter
    //
    // The expected entry comes from a local scan of `reporters.json` (a
    // reporter near miss) or `lexis-courts.json` (a near-miss LEXIS court) in
    // file order with the collapsed key written out above (Req 9.4, 11.5,
    // 14.6), and the expected value is built by the generator, never by
    // `extract`. A near-miss token is never an exact entry, so the text as
    // written differs from the Canonical_Form and a Normalised_Form must be
    // recorded (Req 11.2). A LEXIS value keeps `lexisCourtListed: true`.
    fc.assert(
      fc.property(
        fc.oneof(arbNearMissAlone, arbNearMissParallel, arbNearMissLexis),
        ({ text, token, nmEntry, list, value }) => {
          expect(nmEntry).toBe(firstListEntry(list, token));
          expect(nmEntry).not.toBe(token);
          if (value.kind === "database") expect(value.lexisCourtListed).toBe(true);

          const canonical = format(value);
          expect(canonical.ok).toBe(true);
          if (!canonical.ok) return;
          expect(canonical.value).not.toBe(text);

          const first = extract(text);
          expect(first.citations).toHaveLength(1);
          const [c] = first.citations;
          if (c === undefined) return;
          expect([c.start, c.end]).toEqual([0, text.length]);
          expect(c.text).toBe(text);
          expect(structuralEqual(c.value, value)).toBe(true);
          expect(lexisFlagOf(c.value)).toEqual(lexisFlagOf(value));
          expect(c.normalised).toBe(canonical.value);

          const plain = extract(canonical.value);
          expect(plain.citations).toHaveLength(1);
          const [p] = plain.citations;
          if (p === undefined) return;
          expect([p.start, p.end]).toEqual([0, canonical.value.length]);
          expect(structuralEqual(p.value, value)).toBe(true);
          expect(p.normalised).toBeUndefined();

          expect(extract(text)).toEqual(first);
        },
      ),
      runs(),
    );
  });

  it("example: `2020 Phila.Ct. Com. Pl. LEXIS 5` records the listed court `Phila. Ct. Com. Pl.`", () => {
    const text = "2020 Phila.Ct. Com. Pl. LEXIS 5";
    const value: FullValue = {
      kind: "database",
      year: 2020,
      designator: "LEXIS",
      lexisCourtListed: true,
      lexisCourt: "Phila. Ct. Com. Pl.",
      number: 5,
    };
    expect(firstListEntry(LEXIS_COURTS_JSON, "Phila.Ct. Com. Pl.")).toBe("Phila. Ct. Com. Pl.");
    const normalised = "2020 Phila. Ct. Com. Pl. LEXIS 5";
    expect(format(value)).toEqual({ ok: true, value: normalised });

    const [c, ...rest] = extract(text).citations;
    expect(rest).toEqual([]);
    expect(c).toMatchObject({ start: 0, end: text.length, text, normalised });
    expect(c?.value).toEqual(value);

    const [p, ...others] = extract(normalised).citations;
    expect(others).toEqual([]);
    expect(p?.value).toEqual(value);
    expect(p?.normalised).toBeUndefined();
  });
});

// Property 24 (design "Correctness Properties", [format]; D4).

describe("Property 24: Garbage citations are never extracted and do not disturb the rest _Requirements: 11.3, 14.3_", () => {
  it("garbage at a neutral position yields no overlapping citation, no attached quote, and the same Extraction as spaces in its place", () => {
    // Property 24
    // Feature: provenance-engine, Property 24: Garbage citations are never extracted and do not disturb the rest
    //
    // `g` goes in at a neutral position of an `arbTextWithCitations` text
    // (D4): a word start between two words, outside every recorded citation,
    // quote, and quote-to-citation gap, followed by one space. The spaced
    // text has the same length, so its Extraction is compared without shift.
    fc.assert(
      fc.property(
        arbTextWithCitations,
        arbGarbageCitation,
        fc.nat(),
        ({ text, expected }, g, k) => {
          const positions = neutralPositions(text, expected);
          fc.pre(positions.length > 0);
          const at = positions[k % positions.length] ?? 0;
          const end = at + g.length;
          const withGarbage = `${text.slice(0, at)}${g} ${text.slice(at)}`;
          const withSpaces = `${text.slice(0, at)}${" ".repeat(g.length)} ${text.slice(at)}`;

          const got = extract(withGarbage);
          expect(got.citations.filter((c) => c.start < end && c.end > at)).toEqual([]);
          expect(got.quotes.filter((q) => q.citationStart >= at && q.citationStart < end)).toEqual(
            [],
          );
          expect(got).toEqual(extract(withSpaces));
        },
      ),
      runs(),
    );
  });

  it("seed 26608700: the gap of a quote that attaches to nothing is not neutral", () => {
    // Shrunk counterexample from seed 26608700 (fixture holds seed, path,
    // value). Old neutral.ts picked offset 53, `See |also`, inside the gap of
    // `"a a a a"`, which attaches to nothing (two Gap_Signals, D21). Spaces
    // there made it attach to `1600 WL 1` through `also See …` (D4).
    const { text, expected, garbage: g } = p24Seed26608700;
    const positions = neutralPositions(text, expected);
    expect(text.slice(49, 57)).toBe("See also");
    expect(positions).not.toContain(53);
    expect(positions.length).toBeGreaterThan(0);
    for (const at of positions) {
      const pad = (s: string): string => `${text.slice(0, at)}${s} ${text.slice(at)}`;
      expect(extract(pad(g))).toEqual(extract(pad(" ".repeat(g.length))));
    }
  });

  it("seed 1899639715: `1 Id. A 1` is not a Garbage_Citation, and its `Id.` extracts as an Orphan (D24)", () => {
    // Shrunk counterexample from seed 1899639715, path
    // "393:1:0:0:1:1:1:2:2:2:2:2:2:2:2:2:2:2:2:2:2:12:11:11:10:10:10": text
    // `held 1 A. 1, 1 A. 1`, garbage `1 Id. A 1` at k = 0. Its token `Id. A`
    // matches no reporter, but the word `Id.` starts a Short_Form on its own,
    // so the string is not a Garbage_Citation (D24) and `arbGarbageToken`
    // no longer generates it. The Engine is unchanged: the `Id.` still
    // extracts, as an Orphan (no preceding citation), which blocks export.
    const text = "held 1 Id. A 1 1 A. 1, 1 A. 1";
    const { citations, quotes } = extract(text);
    expect(citations.map((c) => [c.start, c.end, c.text])).toEqual([
      [7, 10, "Id."],
      [15, 29, "1 A. 1, 1 A. 1"],
    ]);
    expect(citations[0]?.value).toEqual({ kind: "short", form: "id", targetStart: null });
    expect(quotes).toEqual([]);
  });
});
