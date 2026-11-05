/**
 * Reporter and Parallel_Citation grammar (design A9 step 3; Req 9.3, 9.5,
 * 11.1, 11.5, 11.6).
 *
 * `<vol> <reporter> <page>[, <pincite>]`, then up to three more
 * `, <vol> <reporter> <page>[, <pincite>]` members (D1, D2), then an optional
 * ` (<court> <year>|<year>|<court>)` under the tightened court rule (D3).
 *
 * The reporter token is resolved longest first: every end `e` within
 * `MAX_REPORTER_TOKEN` code units with `text[e] === " "` is tried from the
 * right, the token is looked up exact first and then collapsed
 * (`lookupReporter`, first `reporters.json` entry wins), and the first token
 * whose member parse succeeds wins.
 *
 * Read bound. A member reads at most 6 + 1 + 41 + 6 + 2 code units, and a
 * pincite check adds 2 + 6 + 1 + 41 + 2 more past the page. Four members and
 * a parenthetical (2 + 46) therefore read under 450 code units past `p`,
 * inside `LOOKAHEAD` (1,024). The only read behind `p` is `text[p − 2 .. p)`
 * for the Req 9.8 left boundary. Nothing here throws.
 */

import type { ParallelValue, ReporterMember, ReporterValue } from "../types.js";
import {
  PAGE_RANGE,
  PINCITE_RANGE,
  VOLUME_RANGE,
  YEAR_RANGE,
  isAsciiDigitAt,
  isWordCharAt,
  isWordCharBefore,
  readInt,
  readLiteral,
  readSpaces,
  type IntRead,
} from "./lex.js";
import { lookupReporter } from "./reporters.js";

/** Longest reporter token the resolver tries (the generator drops longer entries). */
export const MAX_REPORTER_TOKEN = 40;
/** A Parallel_Citation has 2 to 4 members (Req 10.1). */
export const MAX_MEMBERS = 4;
/** Court length bound (Req 10.1, D3). */
export const MAX_COURT_LENGTH = 40;
/** Longest parenthetical content: a court, a space, and a year. */
const MAX_PAREN_CONTENT = MAX_COURT_LENGTH + 5;

export type ReporterMatch = Readonly<{
  start: number;
  end: number;
  value: ReporterValue | ParallelValue;
}>;

/** A recognised parenthetical and the Offset one past its `)`. */
export type Parenthetical = Readonly<{ end: number; court?: string; year?: number }>;

/** A parallel tail: every member read so far and the Offset after the last. */
export type ParallelTail = Readonly<{ members: readonly ReporterMember[]; end: number }>;

type MemberRead = Readonly<{ member: ReporterMember; end: number }>;

/**
 * Resolves the reporter token that starts at `at`, longest first. For each
 * candidate end `e` (`text[e] === " "`, `e − at ≤ MAX_REPORTER_TOKEN`) whose
 * token resolves through `lookupReporter`, calls `follow(reporter, e)`; the
 * first non-null result wins. Reads `text[at .. at + MAX_REPORTER_TOKEN]`
 * plus whatever `follow` reads. `grammar-short` reuses it for the party tail.
 */
export function resolveReporterAt<T>(
  text: string,
  at: number,
  follow: (reporter: string, tokenEnd: number) => T | null,
): T | null {
  if (at < 0) return null;
  const last = Math.min(at + MAX_REPORTER_TOKEN, text.length - 1);
  for (let e = last; e > at; e -= 1) {
    if (text[e] !== " ") continue;
    const reporter = lookupReporter(text.slice(at, e));
    if (reporter === null) continue;
    const result = follow(reporter, e);
    if (result !== null) return result;
  }
  return null;
}

/** Reads `, ` (exactly one space) at `at`; returns the Offset after it. */
function readCommaSpace(text: string, at: number): number | null {
  const comma = readLiteral(text, at, ",");
  return comma === null ? null : readSpaces(text, comma);
}

/** Reads a number that is not followed by a letter or digit (Req 9.8). */
function readBoundedInt(text: string, at: number, range: typeof PAGE_RANGE): IntRead | null {
  const n = readInt(text, at, range);
  return n === null || isWordCharAt(text, n.end) ? null : n;
}

/** Reads `<vol> <reporter> <page>` at `at`, with no pincite. */
function readMemberCore(text: string, at: number): MemberRead | null {
  const vol = readInt(text, at, VOLUME_RANGE);
  if (vol === null) return null;
  const tokenStart = readSpaces(text, vol.end);
  if (tokenStart === null) return null;
  return resolveReporterAt(text, tokenStart, (reporter, e) => {
    const page = readBoundedInt(text, e + 1, PAGE_RANGE);
    if (page === null) return null;
    return { member: { volume: vol.value, reporter, page: page.value }, end: page.end };
  });
}

/**
 * True when `at` starts `<number> <reporter> <digit>`: a number in that
 * position is a parallel volume, never a pincite (design A9 step 3).
 */
function startsMember(text: string, at: number): boolean {
  const vol = readInt(text, at, VOLUME_RANGE);
  const tokenStart = vol === null ? null : readSpaces(text, vol.end);
  if (tokenStart === null) return false;
  const hit = resolveReporterAt(text, tokenStart, (_r, e) =>
    isAsciiDigitAt(text, e + 1) ? true : null,
  );
  return hit === true;
}

/** Reads `, <pincite>` after a page, unless the number starts a member. */
function readPincite(text: string, at: number): IntRead | null {
  const n = readCommaSpace(text, at);
  if (n === null || startsMember(text, n)) return null;
  return readBoundedInt(text, n, PINCITE_RANGE);
}

/** Reads one member, `<vol> <reporter> <page>[, <pincite>]`, at `at`. */
function readMember(text: string, at: number): MemberRead | null {
  const core = readMemberCore(text, at);
  if (core === null) return null;
  const pin = readPincite(text, core.end);
  if (pin === null) return core;
  return { member: { ...core.member, pincite: pin.value }, end: pin.end };
}

/**
 * Extends `members` (ending at `at`) with `, <member>` repeats until
 * `MAX_MEMBERS` members are read or the next member does not parse (D1, D2).
 */
export function matchParallelTail(
  text: string,
  at: number,
  members: readonly ReporterMember[],
): ParallelTail {
  const out = [...members];
  let end = at;
  while (out.length < MAX_MEMBERS) {
    const start = readCommaSpace(text, end);
    const next = start === null ? null : readMember(text, start);
    if (next === null) break;
    out.push(next.member);
    end = next.end;
  }
  return { members: out, end };
}

/** True for a 4-digit year token in 1600–2999 (Req 10.1). */
function isYearToken(token: string): boolean {
  if (token.length !== 4) return false;
  const year = readInt(token, 0, YEAR_RANGE);
  return year !== null && year.end === 4;
}

const COURT_FORBIDDEN = /[\s()"“”]/u;

/**
 * The tightened court rule (D3): 1 to 40 code units, tokens free of
 * whitespace, parentheses, and `"“”`, joined by single U+0020 spaces, and a
 * last token that is not a year.
 */
export function isCourtText(court: string): boolean {
  if (court.length < 1 || court.length > MAX_COURT_LENGTH) return false;
  const tokens = court.split(" ");
  if (tokens.some((t) => t.length === 0 || COURT_FORBIDDEN.test(t))) return false;
  return !isYearToken(tokens[tokens.length - 1] ?? "");
}

/** Index of the `)` that closes content starting at `from`, or null. */
function findClose(text: string, from: number): number | null {
  const limit = Math.min(from + MAX_PAREN_CONTENT, text.length - 1);
  for (let i = from; i <= limit; i += 1) {
    const ch = text[i];
    if (ch === ")") return i;
    if (ch === "(") return null;
  }
  return null;
}

/** Splits parenthetical content into court and year under the court rule. */
function parseContent(content: string, end: number): Parenthetical | null {
  const sp = content.lastIndexOf(" ");
  const lastToken = content.slice(sp + 1);
  if (!isYearToken(lastToken)) return isCourtText(content) ? { end, court: content } : null;
  const year = Number(lastToken);
  if (sp < 0) return { end, year };
  const court = content.slice(0, sp);
  return isCourtText(court) ? { end, court, year } : null;
}

/**
 * Reads ` (<court> <year>)`, ` (<year>)`, or ` (<court>)` at `at`. Returns
 * null when the parenthetical is absent or unrecognised, in which case the
 * citation ends at its page or pincite (D3).
 */
export function matchParenthetical(text: string, at: number): Parenthetical | null {
  const open = readLiteral(text, at, " (");
  if (open === null) return null;
  const close = findClose(text, open);
  if (close === null) return null;
  return parseContent(text.slice(open, close), close + 1);
}

/** Builds the Citation_Value; optional fields are absent when not written. */
function buildValue(
  members: readonly ReporterMember[],
  paren: Parenthetical | null,
): ReporterValue | ParallelValue {
  const extra = {
    ...(paren?.court === undefined ? {} : { court: paren.court }),
    ...(paren?.year === undefined ? {} : { year: paren.year }),
  };
  const [first] = members;
  if (members.length === 1 && first !== undefined) return { kind: "reporter", ...first, ...extra };
  return { kind: "parallel", members, ...extra };
}

/**
 * Matches a Reporter_Citation or Parallel_Citation starting at `p`, or
 * returns null. `p` must hold the first volume digit, not preceded by a
 * letter or digit (Req 9.8). Near_Miss tokens resolve to their Reporter_List
 * entry (Req 11.1, 11.5, 11.6); Garbage_Citation tokens resolve to nothing.
 */
export function matchReporterAt(text: string, p: number): ReporterMatch | null {
  if (!isAsciiDigitAt(text, p) || isWordCharBefore(text, p)) return null;
  const first = readMember(text, p);
  if (first === null) return null;
  const tail = matchParallelTail(text, first.end, [first.member]);
  const paren = matchParenthetical(text, tail.end);
  return { start: p, end: paren?.end ?? tail.end, value: buildValue(tail.members, paren) };
}
