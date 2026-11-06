/**
 * Near-miss case builders for Property 23 in format.properties.test.ts
 * (Req 9.4, 11.1, 11.4, 11.5, 11.6, 14.6): a reporter near miss alone, as a
 * Parallel_Citation member, or as a near-miss LEXIS court, plus the oracle's
 * own collapsed-key list lookup. Kept here so format.properties.test.ts stays
 * under the 300-line module limit.
 */
import fc from "fast-check";
import lexisCourtsJson from "../../src/citations/lexis-courts.json" with { type: "json" };
import reportersJson from "../../src/citations/reporters.json" with { type: "json" };
import {
  arbMember,
  arbNearMissCitation,
  arbNearMissLexisCitation,
} from "../../src/testing/arbitraries";
import type { FullValue, ParallelValue, ReporterMember } from "../../src/types";

/** Req 11.1's collapsed key, written out here so the oracle does not reuse the engine's. */
const collapseKey = (t: string): string => t.replace(/[. ]/g, "");

/** The first entry of `list`, in file order, whose collapsed key equals `token`'s (Req 9.4, 11.5). */
export const firstListEntry = (list: readonly string[], token: string): string | undefined =>
  list.find((e) => collapseKey(e) === collapseKey(token));

const REPORTERS_JSON: readonly string[] = reportersJson;
export const LEXIS_COURTS_JSON: readonly string[] = lexisCourtsJson;

/**
 * A near-miss case: the text as written, the near-miss token (a reporter or
 * a LEXIS court), the list entry the value records for it, the JSON list that
 * entry must come from, and the value the text must extract to.
 */
export type NearMissCase = Readonly<{
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
export const arbNearMissAlone: fc.Arbitrary<NearMissCase> = arbNearMissCitation.map((nm) => ({
  text: nm.text,
  token: nm.token,
  nmEntry: nm.value.reporter,
  list: REPORTERS_JSON,
  value: nm.value,
}));

/** A LEXIS Database_Citation whose court is a collapsed match of a list entry (Req 9.4). */
export const arbNearMissLexis: fc.Arbitrary<NearMissCase> = arbNearMissLexisCitation.map((nm) => ({
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
export const arbNearMissParallel: fc.Arbitrary<NearMissCase> = fc
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
