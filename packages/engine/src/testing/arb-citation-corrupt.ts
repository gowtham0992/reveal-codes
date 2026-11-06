/**
 * `arbValueCorruption` (design "Arbitraries" table, Property 22; Req 22.1,
 * 22.4). Takes an `arbCitation` value and breaks exactly one field, recording
 * the field `validateFullValue` must report. Only one field is broken and the
 * rest stay valid, so the recorded field is also the first failure in the A13
 * order (volume, reporter, page, pincite, court, lexisCourtListed, lexisCourt,
 * year, members, number). LEXIS corruptions (D22) break either the flag
 * (removed, non-boolean, or added to a WL value: `lexisCourtListed`) or the
 * court's consistency with it (`lexisCourt`), never both. A broken parallel
 * member field is broken in one member, chosen by index. The expected field
 * is never inferred from the engine.
 */
import fc from "fast-check";
import {
  DOC_NUMBER_RANGE,
  PAGE_RANGE,
  PINCITE_RANGE,
  VOLUME_RANGE,
  YEAR_RANGE,
  type IntRange,
} from "../citations/lex.js";
import { LEXIS_COURTS } from "../citations/lexis-courts.js";
import { REPORTERS } from "../citations/reporters.js";
import type {
  DatabaseValue,
  FullValue,
  ParallelValue,
  ReporterMember,
  ReporterValue,
} from "../types.js";
import {
  arbCourt,
  arbDatabaseValue,
  arbGarbageToken,
  arbLexisCourt,
  arbParallelValue,
  arbReporter,
  arbReporterValue,
  arbUnlistedLexisCourt,
} from "./arb-citation.js";
import { arbNearMissLexisCourt } from "./arb-lexis-near-miss.js";

/** A broken value and the field `validateFullValue` must name. */
export type ValueCorruption = Readonly<{ value: FullValue; field: string }>;

type Patch<V> = (v: V) => ValueCorruption;

/** Non-integers and integers just outside `range`. */
export const arbBadInt = (r: IntRange): fc.Arbitrary<number> =>
  fc.oneof(
    fc.constantFrom(Number.NaN, Infinity, -Infinity, r.min + 0.5),
    fc.integer({ min: r.max + 1, max: r.max + 1000 }),
    fc.integer({ min: r.min - 1000, max: r.min - 1 }),
  );

/** Strings that break D3: empty, a parenthesis or quote, bad spacing, a final year, too long. */
export const arbBadCourt: fc.Arbitrary<string> = fc.oneof(
  fc.constant(""),
  arbCourt.map((c) => `${c}(`),
  arbCourt.map((c) => `${c}"`),
  arbCourt.map((c) => ` ${c}`),
  arbCourt.map((c) => `${c}  x`),
  arbCourt.map((c) => `${c} 1999`),
  arbCourt.map((c) => c.padEnd(41, "x")),
);

/** Bad courts plus LEXIS-specific faults: a leading `WL` or a `LEXIS` token. */
const arbBadLexisCourt: fc.Arbitrary<string> = fc.oneof(
  arbBadCourt,
  arbCourt.map((c) => `WL ${c}`),
  arbCourt.map((c) => `${c} LEXIS`),
);

/** Courts that are not an Unlisted_Lexis_Court: an entry, a collapsed match, a lower-case token, a comma, a year token. */
const arbNotUnlistedCourt: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom(...LEXIS_COURTS),
  arbNearMissLexisCourt,
  arbUnlistedLexisCourt.map((c) => `foo ${c}`),
  arbUnlistedLexisCourt.map((c) => `${c},`),
  arbUnlistedLexisCourt.map((c) => `${c} 1999`),
  arbBadLexisCourt,
);

const EXACT = new Set(REPORTERS);

/** Strings that are not exact Reporter_List entries. */
export const arbBadReporter: fc.Arbitrary<string> = fc
  .oneof(
    fc.constant(""),
    arbGarbageToken,
    arbReporter.map((r) => `${r}#`),
  )
  .filter((r) => !EXACT.has(r));

/** A patch that sets one field to a bad value and records `field`. */
function patch<V, T>(
  field: string,
  bad: fc.Arbitrary<T>,
  set: (v: V, x: T) => FullValue,
): fc.Arbitrary<Patch<V>> {
  return bad.map((x) => (v: V) => ({ value: set(v, x), field }));
}

/** The four member-level patches, applied to `m`. */
function memberPatches(): fc.Arbitrary<(m: ReporterMember) => [ReporterMember, string]> {
  const of =
    <T>(field: string, set: (m: ReporterMember, x: T) => ReporterMember) =>
    (bad: fc.Arbitrary<T>) =>
      bad.map((x) => (m: ReporterMember): [ReporterMember, string] => [set(m, x), field]);
  return fc.oneof(
    of<number>("volume", (m, volume) => ({ ...m, volume }))(arbBadInt(VOLUME_RANGE)),
    of<string>("reporter", (m, reporter) => ({ ...m, reporter }))(arbBadReporter),
    of<number>("page", (m, page) => ({ ...m, page }))(arbBadInt(PAGE_RANGE)),
    of<number>("pincite", (m, pincite) => ({ ...m, pincite }))(arbBadInt(PINCITE_RANGE)),
  );
}

const reporterPatch: fc.Arbitrary<Patch<ReporterValue>> = fc.oneof(
  memberPatches().map((p) => (v: ReporterValue) => {
    const [m, field] = p(v);
    return { value: { ...v, ...m }, field };
  }),
  patch("court", arbBadCourt, (v: ReporterValue, court) => ({ ...v, court })),
  patch("year", arbBadInt(YEAR_RANGE), (v: ReporterValue, year) => ({ ...v, year })),
);

const parallelPatch: fc.Arbitrary<Patch<ParallelValue>> = fc.oneof(
  fc.tuple(fc.nat(), memberPatches()).map(([at, p]) => (v: ParallelValue) => {
    const i = at % v.members.length;
    let field = "";
    const members = v.members.map((m, j) => {
      if (j !== i) return m;
      const [broken, f] = p(m);
      field = f;
      return broken;
    });
    return { value: { ...v, members }, field };
  }),
  patch("court", arbBadCourt, (v: ParallelValue, court) => ({ ...v, court })),
  patch("year", arbBadInt(YEAR_RANGE), (v: ParallelValue, year) => ({ ...v, year })),
  patch("members", fc.constantFrom(0, 1, 5), (v: ParallelValue, n) => ({
    ...v,
    members: [...v.members, ...v.members, ...v.members].slice(0, n),
  })),
);

/** `v`'s year, number, and pincite under `designator`, with no LEXIS fields. */
function baseOf(v: DatabaseValue, designator: "WL" | "LEXIS"): DatabaseValue {
  const base = { kind: "database", year: v.year, designator, number: v.number } as const;
  return v.pincite === undefined ? base : { ...base, pincite: v.pincite };
}

/** A LEXIS value without its court (flag kept), or a WL value given one. */
function toggleLexisCourt(v: DatabaseValue, court: string): DatabaseValue {
  if (v.designator === "WL") return { ...v, lexisCourt: court };
  const flag = v.lexisCourtListed === undefined ? {} : { lexisCourtListed: v.lexisCourtListed };
  return { ...baseOf(v, "LEXIS"), ...flag };
}

/** Values of the wrong type for `lexisCourtListed`, typed as the field so they can be stored. */
const arbNonBooleanFlag: fc.Arbitrary<boolean> = fc
  .constantFrom<unknown>("true", "false", 0, 1, null)
  .map((x) => x as boolean);

/** The flag corruptions: removed or non-boolean on LEXIS, added to WL. */
const flagPatches: readonly fc.Arbitrary<Patch<DatabaseValue>>[] = [
  patch("lexisCourtListed", arbLexisCourt, (v: DatabaseValue, l) => ({
    ...baseOf(v, "LEXIS"),
    lexisCourt: l.lexisCourt,
  })),
  patch(
    "lexisCourtListed",
    fc.tuple(arbLexisCourt, arbNonBooleanFlag),
    (v: DatabaseValue, [l, f]) => ({
      ...baseOf(v, "LEXIS"),
      lexisCourtListed: f,
      lexisCourt: l.lexisCourt,
    }),
  ),
  patch("lexisCourtListed", fc.boolean(), (v: DatabaseValue, lexisCourtListed) => ({
    ...baseOf(v, "WL"),
    lexisCourtListed,
  })),
];

/** The consistency corruptions: a court that disagrees with a valid flag. */
const consistencyPatches: readonly fc.Arbitrary<Patch<DatabaseValue>>[] = [
  patch("lexisCourt", arbCourt, toggleLexisCourt),
  patch(
    "lexisCourt",
    fc.oneof(arbUnlistedLexisCourt, arbNearMissLexisCourt, arbBadLexisCourt),
    (v: DatabaseValue, lexisCourt) => ({
      ...baseOf(v, "LEXIS"),
      lexisCourtListed: true,
      lexisCourt,
    }),
  ),
  patch("lexisCourt", arbNotUnlistedCourt, (v: DatabaseValue, lexisCourt) => ({
    ...baseOf(v, "LEXIS"),
    lexisCourtListed: false,
    lexisCourt,
  })),
];

const databasePatch: fc.Arbitrary<Patch<DatabaseValue>> = fc.oneof(
  patch("pincite", arbBadInt(PINCITE_RANGE), (v: DatabaseValue, pincite) => ({ ...v, pincite })),
  ...flagPatches,
  ...consistencyPatches,
  patch("year", arbBadInt(YEAR_RANGE), (v: DatabaseValue, year) => ({ ...v, year })),
  patch("number", arbBadInt(DOC_NUMBER_RANGE), (v: DatabaseValue, number) => ({ ...v, number })),
);

/** One broken field of a valid Full_Citation value, with that field recorded. */
export const arbValueCorruption: fc.Arbitrary<ValueCorruption> = fc.oneof(
  fc.tuple(arbReporterValue, reporterPatch).map(([v, p]) => p(v)),
  fc.tuple(arbParallelValue, parallelPatch).map(([v, p]) => p(v)),
  fc.tuple(arbDatabaseValue, databasePatch).map(([v, p]) => p(v)),
);
