/**
 * Short_Form grammar (design A9 step 4; Req 9.2, 12.1, 12.2, 12.8; D16).
 *
 * `matchIdAt` reads `Id.` with an optional ` at <page>`, preceded by the
 * start of the Text, whitespace, or one of `( [ " “ ‘ '`.
 *
 * `matchPartyShortAt` is tail-anchored: it walks the commas in
 * `(p, p + MAX_PARTY]` left to right, takes the first comma `c` whose
 * `, <volume> <reporter> at <page>` tail matches, and succeeds only when
 * `partyStartFor(text, c) === p`. Entity_Suffix commas and prose commas fail
 * the tail check (no volume follows them) and are skipped.
 *
 * `matchShortAt` puts both in one class; the longer wins at the same `p`, so
 * `Id. Smith, 5 U.S. at 9` is one party Short_Form (D16).
 *
 * Pincites. `Id. at` and the party tail read a Pincite_Expression
 * (`pincite.ts`, Req 18): up to five items `page[-short]` joined by `, `, at
 * most 24 code units. The value keeps the first page; the match end is the
 * end of the expression.
 *
 * Read bound. Behind `p`: `matchIdAt` reads `text[p − 1]`; the party form
 * reads `text[p − 2 .. p)` for its fast reject and `partyStartFor` reads
 * indices `≥ c − PARTY_SCAN ≥ p − 160`, inside `LOOKBEHIND` (162). Ahead:
 * the last comma is at most `p + MAX_PARTY`, and the tail reads under 130 code
 * units past it (a 24-unit pincite and the `startsMember` look-ahead of a
 * later item), inside `LOOKAHEAD`. Nothing here throws.
 */

import type { IdValue, PartyValue } from "../types.js";
import { VOLUME_RANGE, readInt, readLiteral } from "./lex.js";
import { resolveReporterAt, startsMember } from "./grammar.js";
import { readPinciteExpression, type PinciteRead } from "./pincite.js";
import { MAX_PARTY, partyStartFor } from "./party.js";
import { isPartyWordUnitAt } from "./party-lex.js";
import { LEGAL_ABBREVIATION_INDEX } from "./reporters.js";

export type IdMatch = Readonly<{ start: number; end: number; value: IdValue }>;
export type PartyMatch = Readonly<{ start: number; end: number; value: PartyValue }>;
export type ShortMatch = IdMatch | PartyMatch;

/** Code units allowed directly before `Id.` other than whitespace (Req 12.1). */
const ID_OPENERS: ReadonlySet<string> = new Set(["(", "[", '"', "“", "‘", "'"]);
const WHITESPACE = /^\s$/u;
const UPPERCASE_START = /^\p{Lu}/u;

const isOffset = (n: number): boolean => Number.isInteger(n) && n >= 0;

/** True when `p` is 0 or `text[p − 1]` is whitespace or an opener. */
function idLeftContextOk(text: string, p: number): boolean {
  if (p === 0) return true;
  const before = text.charAt(p - 1);
  return WHITESPACE.test(before) || ID_OPENERS.has(before);
}

/** Reads a Pincite_Expression (Req 18); `first` is the stored pincite. */
function readPinciteAt(text: string, at: number): PinciteRead | null {
  return readPinciteExpression(text, at, { list: true, startsMember });
}

/**
 * Matches `Id.` or `Id. at <page>` at `p` (Req 12.1). The ` at <page>` part
 * is optional; when it is absent or malformed the match ends at the period.
 * `targetStart` is null here; linking sets it later.
 */
export function matchIdAt(text: string, p: number): IdMatch | null {
  if (!isOffset(p) || !idLeftContextOk(text, p)) return null;
  const idEnd = readLiteral(text, p, "Id.");
  if (idEnd === null) return null;
  const atEnd = readLiteral(text, idEnd, " at ");
  const page = atEnd === null ? null : readPinciteAt(text, atEnd);
  if (page === null) {
    return { start: p, end: idEnd, value: { kind: "short", form: "id", targetStart: null } };
  }
  const value: IdValue = { kind: "short", form: "id", pincite: page.first, targetStart: null };
  return { start: p, end: page.end, value };
}

/** True when some Legal_Abbreviation other than `v.` starts with `unit`. */
function startsLegalAbbreviation(unit: string): boolean {
  const entries = LEGAL_ABBREVIATION_INDEX.byFirstUnit.get(unit) ?? [];
  return entries.some((a) => a !== "v.");
}

/** Step 1: `text[p]` can start a Capitalised_Word and `text[p − 1]` is not in `W`. */
function partyFastAccept(text: string, p: number): boolean {
  if (!isOffset(p) || p >= text.length) return false;
  if (p > 0 && isPartyWordUnitAt(text, p - 1)) return false;
  const head = text.slice(p, p + 2);
  return UPPERCASE_START.test(head) || startsLegalAbbreviation(text.charAt(p));
}

type Tail = Readonly<{ volume: number; reporter: string; page: number; end: number }>;

/** Step 3: `, <vol> <reporter> at <page>` at the comma `c`, or null. */
function matchPartyTailAt(text: string, c: number): Tail | null {
  const volStart = readLiteral(text, c, ", ");
  const vol = volStart === null ? null : readInt(text, volStart, VOLUME_RANGE);
  if (vol === null || text[vol.end] !== " ") return null;
  return resolveReporterAt(text, vol.end + 1, (reporter, e) => {
    const pageStart = readLiteral(text, e, " at ");
    const page = pageStart === null ? null : readPinciteAt(text, pageStart);
    if (page === null) return null;
    return { volume: vol.value, reporter, page: page.first, end: page.end };
  });
}

/** Step 2: the first comma in `(p, p + MAX_PARTY]` whose tail matches. */
function firstTailComma(text: string, p: number): Readonly<{ c: number; tail: Tail }> | null {
  const last = Math.min(p + MAX_PARTY, text.length - 1);
  for (let c = p + 1; c <= last; c += 1) {
    if (text[c] !== ",") continue;
    const tail = matchPartyTailAt(text, c);
    if (tail !== null) return { c, tail };
  }
  return null;
}

/**
 * Matches `<party>, <volume> <reporter> at <page>` starting at `p` (Req 9.2,
 * 12.2, 12.8), where `p` must be the canonical party start
 * `partyStartFor(text, c)` for the first tail-matching comma `c`.
 */
export function matchPartyShortAt(text: string, p: number): PartyMatch | null {
  if (!partyFastAccept(text, p)) return null;
  const found = firstTailComma(text, p);
  if (found === null || partyStartFor(text, found.c) !== p) return null;
  const { c, tail } = found;
  const value: PartyValue = {
    kind: "short",
    form: "party",
    party: text.slice(p, c),
    volume: tail.volume,
    reporter: tail.reporter,
    pincite: tail.page,
    targetStart: null,
  };
  return { start: p, end: tail.end, value };
}

/**
 * The Short_Form class at `p`: `Id.` and the party form, longer wins (D16).
 * The two never tie in length, since a party match always extends past the
 * `Id.` it would contain.
 */
export function matchShortAt(text: string, p: number): ShortMatch | null {
  const id = matchIdAt(text, p);
  const party = matchPartyShortAt(text, p);
  if (id === null) return party;
  if (party === null) return id;
  return party.end > id.end ? party : id;
}
