/**
 * Near-miss LEXIS arbitraries (design "Arbitraries" table, Properties 22 and
 * 23; Req 9.4, 11.2).
 *
 * - `arbNearMissLexisCourt`: a Lexis_Court_List entry with one period or
 *   space removed that is not itself an entry, so it matches an entry only
 *   once periods and spaces are removed (a collapsed match).
 * - `arbNearMissLexisCitation`: `{ text, court, value }`, the LEXIS form
 *   `<year> <court> LEXIS <number>` with an optional `, at *<pin>`, where
 *   `court` is an `arbNearMissLexisCourt` as written and `value` records the
 *   first collapsed-matching entry in `lexis-courts.json` order with
 *   `lexisCourtListed: true`.
 *
 * `arb-citation-corrupt.ts` imports the court arbitrary from here; this module
 * imports only Engine data modules, so there is no import cycle.
 */
import fc from "fast-check";
import { DOC_NUMBER_RANGE, PINCITE_RANGE, YEAR_RANGE, type IntRange } from "../citations/lex.js";
import { LEXIS_COURTS, lexisCollapsedIndex, lexisExactIndex } from "../citations/lexis-courts.js";
import { collapseReporter } from "../citations/reporters.js";
import type { DatabaseValue } from "../types.js";

const NEAR_MISS_SOURCES = LEXIS_COURTS.filter((c) => /[. ]/.test(c));

/** A list entry with one period or space removed that is not itself an entry (a collapsed match). */
export const arbNearMissLexisCourt: fc.Arbitrary<string> = fc
  .tuple(fc.constantFrom(...NEAR_MISS_SOURCES), fc.nat())
  .map(([entry, at]) => {
    const sites = Array.from({ length: entry.length }, (_, i) => i).filter(
      (i) => entry[i] === "." || entry[i] === " ",
    );
    const i = sites[at % sites.length] ?? 0;
    return entry.slice(0, i) + entry.slice(i + 1);
  })
  .filter((c) => c.length > 0 && !lexisExactIndex.has(c));

/** A near-miss LEXIS Database_Citation: the text, its court as written, and the expected value. */
export type NearMissLexis = Readonly<{ text: string; court: string; value: DatabaseValue }>;

const int = (r: IntRange): fc.Arbitrary<number> => fc.integer({ min: r.min, max: r.max });

/** The first `lexis-courts.json` entry whose collapsed key equals `court`'s, or `""`. */
const firstCollapsedCourt = (court: string): string =>
  LEXIS_COURTS[lexisCollapsedIndex.get(collapseReporter(court)) ?? -1] ?? "";

/** `<year> <court> LEXIS <number>[, at *<pin>]` with the value it must extract to (Req 9.4). */
export const arbNearMissLexisCitation: fc.Arbitrary<NearMissLexis> = fc
  .tuple(
    int(YEAR_RANGE),
    arbNearMissLexisCourt,
    int(DOC_NUMBER_RANGE),
    fc.option(int(PINCITE_RANGE), { nil: undefined }),
  )
  .map(([year, court, number, pincite]) => {
    const pin = pincite === undefined ? "" : `, at *${String(pincite)}`;
    const base = {
      kind: "database",
      year,
      designator: "LEXIS",
      lexisCourtListed: true,
      lexisCourt: firstCollapsedCourt(court),
      number,
    } as const;
    const value: DatabaseValue = pincite === undefined ? base : { ...base, pincite };
    return { text: `${String(year)} ${court} LEXIS ${String(number)}${pin}`, court, value };
  });
