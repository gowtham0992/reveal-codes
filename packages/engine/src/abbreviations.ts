/**
 * Legal_Abbreviations and Entity_Suffix words (design A8, Req 8.6, 9.2,
 * 12.2, 13.1). The Segmenter places no Sentence boundary after a
 * Legal_Abbreviation's final period, and `isPartyName` uses
 * `abbreviationsStartingAt` to accept every period inside one.
 *
 * The Glossary's Legal_Abbreviation list also includes every reporter
 * abbreviation. The index builders therefore take those extra entries as a
 * parameter; the default index holds only the non-reporter list, and the
 * reporter module (task 5.2) builds the full index from `REPORTERS`.
 */

/** The non-reporter Legal_Abbreviations, in Glossary order. */
export const LEGAL_ABBREVIATIONS: readonly string[] = [
  "Id.",
  "v.",
  "Inc.",
  "Corp.",
  "Ltd.",
  "Co.",
  "L.P.",
  "N.A.",
  "L.L.C.",
  "No.",
  "Cir.",
  "Dist.",
  "Ct.",
  "Fed.",
  "Supp.",
  "et al.",
];

/**
 * The words that may follow `, ` in an Entity_Suffix (Glossary). Shared by
 * `citations/party.ts` and `citations/case-name.ts`. Every entry except
 * `LLC` is also a Legal_Abbreviation.
 */
export const ENTITY_SUFFIX_WORDS: readonly string[] = [
  "Inc.",
  "LLC",
  "L.L.C.",
  "Ltd.",
  "Co.",
  "Corp.",
  "L.P.",
  "N.A.",
];

/** Legal_Abbreviations keyed by their length in code units. */
export type LengthIndex = ReadonlyMap<number, ReadonlySet<string>>;

/** Legal_Abbreviations keyed by their first code unit, shortest first. */
export type FirstUnitIndex = ReadonlyMap<string, readonly string[]>;

export type AbbreviationIndex = Readonly<{
  byLength: LengthIndex;
  byFirstUnit: FirstUnitIndex;
  /** Length of the longest entry; `ABBR_LOOKBEHIND` is this plus one. */
  longest: number;
}>;

const allEntries = (extra: readonly string[]): readonly string[] => [
  ...new Set([...LEGAL_ABBREVIATIONS, ...extra].filter((a) => a.length > 0)),
];

/** Builds the length-indexed set over the non-reporter list plus `extra`. */
export function buildLengthIndex(extra: readonly string[]): LengthIndex {
  const index = new Map<number, Set<string>>();
  for (const a of allEntries(extra)) {
    const bucket = index.get(a.length) ?? new Set<string>();
    bucket.add(a);
    index.set(a.length, bucket);
  }
  return index;
}

/** Builds the first-code-unit index over the non-reporter list plus `extra`. */
export function buildFirstUnitIndex(extra: readonly string[]): FirstUnitIndex {
  const index = new Map<string, string[]>();
  for (const a of allEntries(extra)) {
    const key = a.charAt(0);
    index.set(key, [...(index.get(key) ?? []), a]);
  }
  for (const bucket of index.values()) bucket.sort((x, y) => x.length - y.length);
  return index;
}

export function buildAbbreviationIndex(extra: readonly string[]): AbbreviationIndex {
  const longest = allEntries(extra).reduce((m, a) => (a.length > m ? a.length : m), 0);
  return { byLength: buildLengthIndex(extra), byFirstUnit: buildFirstUnitIndex(extra), longest };
}

/** The index over the non-reporter list only. */
export const BASE_ABBREVIATION_INDEX: AbbreviationIndex = buildAbbreviationIndex([]);

const isWhitespace = (unit: string): boolean => /\s/.test(unit);

/** Start of the Text, a whitespace code unit, or `(` (Req 8.6). */
const isAbbreviationContext = (text: string, start: number): boolean =>
  start === 0 || isWhitespace(text.charAt(start - 1)) || text.charAt(start - 1) === "(";

/**
 * True when `text[i]` is `.` and is the final period of a Legal_Abbreviation
 * that matches exactly (case-sensitive) and is preceded by the start of the
 * Text, whitespace, or `(` (Req 8.6).
 */
export function isAbbreviationEndingAt(
  text: string,
  i: number,
  index: AbbreviationIndex = BASE_ABBREVIATION_INDEX,
): boolean {
  if (!Number.isInteger(i) || i < 0 || i >= text.length || text.charAt(i) !== ".") return false;
  for (const [length, entries] of index.byLength) {
    const start = i - length + 1;
    if (start < 0) continue;
    if (entries.has(text.slice(start, i + 1)) && isAbbreviationContext(text, start)) return true;
  }
  return false;
}

/**
 * The end Offset of every Legal_Abbreviation occurrence that starts at `at`
 * and ends at or before `limit`, in ascending order. The caller decides
 * whether `at` is a valid word start (design D9).
 */
export function abbreviationsStartingAt(
  text: string,
  at: number,
  limit: number,
  index: AbbreviationIndex = BASE_ABBREVIATION_INDEX,
): readonly number[] {
  if (!Number.isInteger(at) || at < 0 || at >= text.length) return [];
  const bound = Math.min(limit, text.length);
  const ends: number[] = [];
  for (const a of index.byFirstUnit.get(text.charAt(at)) ?? []) {
    if (at + a.length <= bound && text.startsWith(a, at)) ends.push(at + a.length);
  }
  return ends;
}
