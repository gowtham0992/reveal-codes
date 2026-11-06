/**
 * Citation arbitraries (design "Arbitraries" table; Req 22.1, 22.4).
 *
 * - `arbCourt` / `arbLexisCourt`: courts under the tightened rule D3, with no
 *   `LEXIS` or `WL` token, so they are also valid LEXIS courts.
 * - `arbCitation`: valid Full_Citation values (reporter, parallel, database)
 *   with numbers in the Req 10.1 ranges and reporters from `REPORTERS`.
 * - `arbNearMissCitation`: `{ text, token, value }`, where `token` is an entry
 *   with one or more period/space edits that is not itself an entry, and
 *   `value.reporter` is the first `REPORTERS` entry with the same collapsed key.
 * - `arbGarbageCitation`: `<vol> <token> <page>` whose token resolves neither
 *   exactly nor collapsed.
 * - `arbValueCorruption` lives in `arb-citation-corrupt.ts` (module size).
 *
 * Everything is built from fast-check combinators, so values shrink.
 */
import fc from "fast-check";
import { MAX_REPORTER_TOKEN } from "../citations/grammar.js";
import {
  DOC_NUMBER_RANGE,
  PAGE_RANGE,
  PINCITE_RANGE,
  VOLUME_RANGE,
  YEAR_RANGE,
  type IntRange,
} from "../citations/lex.js";
import { LEXIS_COURTS } from "../citations/lexis-courts.js";
import { collapseReporter, lookupReporter, REPORTERS } from "../citations/reporters.js";
import type {
  DatabaseValue,
  FullValue,
  ParallelValue,
  ReporterMember,
  ReporterValue,
} from "../types.js";

const COURT_WORDS = ["D.", "Cir.", "2d", "9th", "N.Y.", "Cal.", "App.", "Ct.", "Dist.", "S.D."];
const COURT_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.&'-";

const int = (r: IntRange): fc.Arbitrary<number> => fc.integer({ min: r.min, max: r.max });

/** One code unit of an ASCII alphabet, shrinking toward its first character. */
const asciiUnit = (chars: string): fc.Arbitrary<string> =>
  fc.integer({ min: 0, max: chars.length - 1 }).map((i) => chars.charAt(i));

/** One court token: a common court word or 1 to 8 code units of `COURT_CHARS`. */
const arbCourtToken: fc.Arbitrary<string> = fc
  .oneof(
    fc.constantFrom(...COURT_WORDS),
    fc.string({ unit: asciiUnit(COURT_CHARS), minLength: 1, maxLength: 8 }),
  )
  .map((t) => (t === "LEXIS" || t === "WL" ? `${t}.` : t));

/** True for a token the parenthetical rule would read as a year (D3). */
const isYearLike = (t: string): boolean =>
  /^\d{4}$/.test(t) && Number(t) >= YEAR_RANGE.min && Number(t) <= YEAR_RANGE.max;

/**
 * A court under D3: 1 to 3 tokens (at most 10 code units each, so at most 32
 * in all), single spaces, and a last token that is not a year. No token is
 * `LEXIS` or `WL`, so every value is also a valid `lexisCourt`.
 */
export const arbCourt: fc.Arbitrary<string> = fc
  .array(arbCourtToken, { minLength: 1, maxLength: 3 })
  .map((tokens) => {
    const last = tokens[tokens.length - 1] ?? "";
    const fixed = isYearLike(last) ? [...tokens.slice(0, -1), `${last}.`] : tokens;
    return fixed.join(" ");
  });

/**
 * A court string with no `LEXIS` or `WL` token. Since task 5.47 it is not by
 * itself a valid `lexisCourt` (A13); `arbValueCorruption` uses it to build bad
 * LEXIS courts. Task 5.49 replaces it with the listed/unlisted `arbLexisCourt`.
 */
export const arbLexisCourt: fc.Arbitrary<string> = arbCourt;

/** An exact Reporter_List entry. */
export const arbReporter: fc.Arbitrary<string> = fc.constantFrom(...REPORTERS);

const optional = { requiredKeys: [] as [] };

export const arbMember: fc.Arbitrary<ReporterMember> = fc
  .tuple(int(VOLUME_RANGE), arbReporter, int(PAGE_RANGE), fc.option(int(PINCITE_RANGE)))
  .map(([volume, reporter, page, pincite]) =>
    pincite === null ? { volume, reporter, page } : { volume, reporter, page, pincite },
  );

/** Optional court and year, with absent fields left out (Req 10.3). */
const arbCourtYear: fc.Arbitrary<{ court?: string; year?: number }> = fc.record(
  { court: arbCourt, year: int(YEAR_RANGE) },
  optional,
);

export const arbReporterValue: fc.Arbitrary<ReporterValue> = fc
  .tuple(arbMember, arbCourtYear)
  .map(([m, cy]) => ({ kind: "reporter", ...m, ...cy }));

export const arbParallelValue: fc.Arbitrary<ParallelValue> = fc
  .tuple(fc.array(arbMember, { minLength: 2, maxLength: 4 }), arbCourtYear)
  .map(([members, cy]) => ({ kind: "parallel", members, ...cy }));

const arbPincite: fc.Arbitrary<{ pincite?: number }> = fc.record(
  { pincite: int(PINCITE_RANGE) },
  optional,
);

/**
 * A `WL` value, or a LEXIS value with a listed court (an exact
 * `lexis-courts.json` entry, `lexisCourtListed: true`). Unlisted courts are
 * added by task 5.49.
 */
export const arbDatabaseValue: fc.Arbitrary<DatabaseValue> = fc
  .tuple(
    int(YEAR_RANGE),
    fc.option(fc.constantFrom(...LEXIS_COURTS)),
    int(DOC_NUMBER_RANGE),
    arbPincite,
  )
  .map(([year, court, number, pin]) =>
    court === null
      ? { kind: "database", year, designator: "WL", number, ...pin }
      : {
          kind: "database",
          year,
          designator: "LEXIS",
          lexisCourtListed: true,
          lexisCourt: court,
          number,
          ...pin,
        },
  );

/** Valid Full_Citation values (Req 10.1). */
export const arbCitation: fc.Arbitrary<FullValue> = fc.oneof(
  arbReporterValue,
  arbParallelValue,
  arbDatabaseValue,
);

// Near misses

type Edit = Readonly<{ kind: "dropPeriod" | "dropSpace" | "spaceAfterPeriod"; at: number }>;

const arbEdit: fc.Arbitrary<Edit> = fc.record({
  kind: fc.constantFrom("dropPeriod", "dropSpace", "spaceAfterPeriod"),
  at: fc.nat(),
});

/** Positions where `edit` can apply: a period, a space, or an inner period not before a space. */
function editSites(token: string, kind: Edit["kind"]): number[] {
  const sites: number[] = [];
  for (let i = 0; i < token.length; i += 1) {
    const ch = token[i];
    if (kind === "dropSpace" ? ch === " " : ch === ".") sites.push(i);
  }
  if (kind !== "spaceAfterPeriod") return sites;
  return sites.filter((i) => i + 1 < token.length && token[i + 1] !== " ");
}

/** Applies one edit at the `at`-th applicable site, or leaves `token` alone. */
function applyEdit(token: string, edit: Edit): string {
  const sites = editSites(token, edit.kind);
  const i = sites[edit.at % Math.max(sites.length, 1)];
  if (i === undefined) return token;
  if (edit.kind === "spaceAfterPeriod") return `${token.slice(0, i + 1)} ${token.slice(i + 1)}`;
  return token.slice(0, i) + token.slice(i + 1);
}

/** The first entry, in `REPORTERS` order, whose collapsed key equals the token's. */
export function firstCollapsedEntry(token: string): string | undefined {
  const key = collapseReporter(token);
  return REPORTERS.find((e) => collapseReporter(e) === key);
}

const EDITABLE = REPORTERS.filter((r) => r.includes(".") || r.includes(" "));
const EXACT = new Set(REPORTERS);

/** A near-miss reporter token: edited, not an entry, single-spaced, and resolvable. */
export const arbNearMissToken: fc.Arbitrary<string> = fc
  .tuple(fc.constantFrom(...EDITABLE), fc.array(arbEdit, { minLength: 1, maxLength: 4 }))
  .map(([entry, edits]) => edits.reduce(applyEdit, entry))
  .filter(
    (t) =>
      !EXACT.has(t) &&
      t.length <= MAX_REPORTER_TOKEN &&
      !t.includes("  ") &&
      t.trim() === t &&
      collapseReporter(t).length > 0,
  );

export type NearMiss = Readonly<{ text: string; token: string; value: ReporterValue }>;

/** `<vol> <token> <page>` with the expected Reporter_Citation value (Req 11.1, 11.5). */
export const arbNearMissCitation: fc.Arbitrary<NearMiss> = fc
  .tuple(int(VOLUME_RANGE), arbNearMissToken, int(PAGE_RANGE))
  .map(([volume, token, page]) => ({
    text: `${String(volume)} ${token} ${String(page)}`,
    token,
    value: { kind: "reporter", volume, reporter: firstCollapsedEntry(token) ?? "", page },
  }));

// Garbage

const arbGarbageWord: fc.Arbitrary<string> = fc
  .tuple(
    asciiUnit("ABCDEFGHIJKLMNOPQRSTUVWXYZ"),
    fc.string({ unit: asciiUnit("abcdefghijklmnopqrstuvwxyz"), maxLength: 3 }),
    fc.boolean(),
  )
  .map(([head, tail, dot]) => head + tail + (dot ? "." : ""));

/** A digit-free token of 1 to 3 words that matches no entry, exactly or collapsed. */
export const arbGarbageToken: fc.Arbitrary<string> = fc
  .array(arbGarbageWord, { minLength: 1, maxLength: 3 })
  .map((words) => words.join(" "))
  .filter((t) => lookupReporter(t) === null);

/** A Garbage_Citation string, `<vol> <token> <page>` (Req 11.3). */
export const arbGarbageCitation: fc.Arbitrary<string> = fc
  .tuple(int(VOLUME_RANGE), arbGarbageToken, int(PAGE_RANGE))
  .map(([v, t, p]) => `${String(v)} ${t} ${String(p)}`);
