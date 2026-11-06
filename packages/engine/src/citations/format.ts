/**
 * Canonical citation format (design A13, Req 10.1, 10.2, 10.5, 11.4).
 *
 * `validateFullValue` checks a Citation_Value field by field in a fixed
 * order and reports the first failure as `invalid_citation { field }`:
 *
 *   kind, volume, reporter, page, pincite, court, lexisCourtListed,
 *   lexisCourt, year, members, number
 *
 * For a Parallel_Citation each member-level step (volume, reporter, page,
 * pincite) checks every member in order before the next step runs, so the
 * reported field does not depend on which member is broken. Short_Form and
 * Other_Reference values fail at `kind`.
 *
 * `format` lays out the Canonical_Form of Req 10.2, plus D1: a parallel
 * member's pincite is written as `, <pincite>` after that member's page, as
 * in `410 U.S. 113, 116, 93 S. Ct. 705, 708 (1973)`.
 *
 * Court rules follow the tightened rule D3 so the Req 10.3 round trip holds.
 * The two LEXIS fields follow A13 and D22: `lexisCourtListed` is a boolean on
 * a LEXIS value and absent on a WL value; `lexisCourt` is then an exact
 * Lexis_Court_List entry when listed, or an Unlisted_Lexis_Court (which
 * matches no entry, exactly or collapsed) when unlisted, and absent on a WL
 * value. `format` prints the court as recorded and never prints the flag.
 * Nothing here throws.
 */

import type { EngineError, InvalidCitation } from "../errors.js";
import { err, ok, type Result } from "../result.js";
import type {
  CitationValue,
  DatabaseValue,
  FullValue,
  ParallelValue,
  ReporterMember,
} from "../types.js";
import { isCourtText, MAX_MEMBERS } from "./grammar.js";
import {
  DOC_NUMBER_RANGE,
  PAGE_RANGE,
  PINCITE_RANGE,
  VOLUME_RANGE,
  YEAR_RANGE,
  type IntRange,
} from "./lex.js";
import { isUnlistedLexisCourt, lexisExactIndex } from "./lexis-courts.js";
import { exactIndex } from "./reporters.js";

/** Smallest Parallel_Citation (Req 10.1). */
const MIN_MEMBERS = 2;

type Check = Readonly<{ field: string; ok: (v: FullValue) => boolean }>;

/** True for an integer in `range` (Req 10.1). */
function isIntIn(n: unknown, range: IntRange): boolean {
  return typeof n === "number" && Number.isInteger(n) && n >= range.min && n <= range.max;
}

/** True when `n` is absent or an integer in `range`. */
function isOptIntIn(n: unknown, range: IntRange): boolean {
  return n === undefined || isIntIn(n, range);
}

/** True when `r` is spelled exactly as a Reporter_List entry. */
function isReporter(r: unknown): boolean {
  return typeof r === "string" && exactIndex.has(r);
}

/** True when `c` is absent or a court under the tightened rule (D3). */
function isOptCourt(c: unknown): boolean {
  return c === undefined || (typeof c === "string" && isCourtText(c));
}

/** The reporter members of a value: itself, its members, or none. */
function membersOf(v: FullValue): readonly ReporterMember[] {
  if (v.kind === "reporter") return [v];
  return v.kind === "parallel" ? v.members : [];
}

/** A member-level check, applied to every member in order. */
function eachMember(field: string, test: (m: ReporterMember) => boolean): Check {
  return { field, ok: (v) => membersOf(v).every(test) };
}

/** `lexisCourtListed` is a boolean iff the designator is `LEXIS` (A13). */
function isLexisFlag(v: DatabaseValue): boolean {
  const flag: unknown = v.lexisCourtListed;
  return v.designator === "WL" ? flag === undefined : typeof flag === "boolean";
}

/**
 * `lexisCourt` agrees with the recorded flag (A13, D22): absent on WL, an
 * exact list entry when listed, an Unlisted_Lexis_Court when unlisted. Runs
 * only after `isLexisFlag` passed.
 */
function isLexisCourtPart(v: DatabaseValue): boolean {
  const c: unknown = v.lexisCourt;
  if (v.designator === "WL") return c === undefined;
  if (typeof c !== "string") return false;
  return v.lexisCourtListed === true ? lexisExactIndex.has(c) : isUnlistedLexisCourt(c);
}

const CHECKS: readonly Check[] = [
  eachMember("volume", (m) => isIntIn(m.volume, VOLUME_RANGE)),
  eachMember("reporter", (m) => isReporter(m.reporter)),
  eachMember("page", (m) => isIntIn(m.page, PAGE_RANGE)),
  {
    field: "pincite",
    ok: (v) =>
      v.kind === "database"
        ? isOptIntIn(v.pincite, PINCITE_RANGE)
        : membersOf(v).every((m) => isOptIntIn(m.pincite, PINCITE_RANGE)),
  },
  { field: "court", ok: (v) => v.kind === "database" || isOptCourt(v.court) },
  { field: "lexisCourtListed", ok: (v) => v.kind !== "database" || isLexisFlag(v) },
  { field: "lexisCourt", ok: (v) => v.kind !== "database" || isLexisCourtPart(v) },
  {
    field: "year",
    ok: (v) =>
      v.kind === "database" ? isIntIn(v.year, YEAR_RANGE) : isOptIntIn(v.year, YEAR_RANGE),
  },
  {
    field: "members",
    ok: (v) =>
      v.kind !== "parallel" || (v.members.length >= MIN_MEMBERS && v.members.length <= MAX_MEMBERS),
  },
  { field: "number", ok: (v) => v.kind !== "database" || isIntIn(v.number, DOC_NUMBER_RANGE) },
];

/** True for the three Full_Citation kinds. */
function isFullKind(v: CitationValue): v is FullValue {
  return v.kind === "reporter" || v.kind === "parallel" || v.kind === "database";
}

/**
 * Validates a Citation_Value as a Full_Citation under Req 10.1 and the court
 * rule D3. Returns the value, or `invalid_citation` naming the first field
 * that fails in A13 order (Req 10.5).
 */
export function validateFullValue(v: CitationValue): Result<FullValue, InvalidCitation> {
  if (!isFullKind(v)) return err({ kind: "invalid_citation", field: "kind" });
  const failed = CHECKS.find((c) => !c.ok(v));
  return failed === undefined ? ok(v) : err({ kind: "invalid_citation", field: failed.field });
}

/** `<volume> <reporter> <page>[, <pincite>]` (Req 10.2, D1). */
function layoutMember(m: ReporterMember): string {
  const core = [String(m.volume), m.reporter, String(m.page)].join(" ");
  return m.pincite === undefined ? core : `${core}, ${String(m.pincite)}`;
}

/** ` (<court> <year>)`, ` (<year>)`, ` (<court>)`, or nothing (Req 10.2). */
function layoutParenthetical(court: string | undefined, year: number | undefined): string {
  const parts = [court, year === undefined ? undefined : String(year)].filter(
    (p): p is string => p !== undefined,
  );
  return parts.length === 0 ? "" : ` (${parts.join(" ")})`;
}

/** `<year> WL <n>` or `<year> <court> LEXIS <n>`, then `, at *<pincite>`. */
function layoutDatabase(v: DatabaseValue): string {
  const designator = v.designator === "WL" ? "WL" : `${v.lexisCourt ?? ""} LEXIS`;
  const core = [String(v.year), designator, String(v.number)].join(" ");
  return v.pincite === undefined ? core : `${core}, at *${String(v.pincite)}`;
}

/** Comma-joined members and one shared parenthetical (Req 10.2, D1, D2). */
function layoutParallel(v: ParallelValue): string {
  return v.members.map(layoutMember).join(", ") + layoutParenthetical(v.court, v.year);
}

/** Lays out an already validated Full_Citation value. */
function layout(v: FullValue): string {
  if (v.kind === "database") return layoutDatabase(v);
  if (v.kind === "parallel") return layoutParallel(v);
  return layoutMember(v) + layoutParenthetical(v.court, v.year);
}

/**
 * The Canonical_Form of a valid Full_Citation value (Req 10.1, 10.2), or
 * `invalid_citation` for any other value, including Short_Form and
 * Other_Reference values (Req 10.5). A Near_Miss's Normalised_Form is
 * `format` of its value (Req 11.4).
 */
export function format(value: CitationValue): Result<string, EngineError> {
  const valid = validateFullValue(value);
  return valid.ok ? ok(layout(valid.value)) : valid;
}
