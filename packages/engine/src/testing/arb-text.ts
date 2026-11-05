/**
 * Text and Timestamp arbitraries (design "Arbitraries" table, Req 22.1,
 * 22.4). Built only from fast-check combinators, so every value shrinks.
 * Only `src/testing/` may import fast-check.
 */
import fc from "fast-check";
import { LEGAL_ABBREVIATIONS } from "../abbreviations.js";
import { isValidBoundary } from "../validate.js";

const fromUnits = (units: readonly number[]): string =>
  units.map((u) => String.fromCharCode(u)).join("");

const printableAscii = fc.integer({ min: 0x20, max: 0x7e }).map((u) => String.fromCharCode(u));

const whitespace = fc.constantFrom(" ", "\n", "\t");

/** Codes syntax (`[`, `]`, the `\` Escape_Character, `{`, `}`) and straight and curly quotes. */
const special = fc.constantFrom("[", "]", "\\", "{", "}", '"', "\u201c", "\u201d");

const astral = fc.integer({ min: 0x10000, max: 0x10ffff }).map((cp) => String.fromCodePoint(cp));

/**
 * Strings of 0 to 2,000 code units. Each item is at most 2 code units and
 * there are at most 1,000 items. Surrogates appear only in Surrogate_Pairs.
 */
export const arbText: fc.Arbitrary<string> = fc
  .array(fc.oneof(printableAscii, whitespace, special, astral), { maxLength: 1000 })
  .map((items) => items.join(""));

/** Any sequence of UTF-16 code units, including lone surrogates (Req 9.9, 20.6). */
export const arbAnyString: fc.Arbitrary<string> = fc
  .array(fc.integer({ min: 0, max: 0xffff }))
  .map(fromUnits);

const isLeapYear = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

const daysInMonth = (y: number, m: number): number => {
  if (m === 2) return isLeapYear(y) ? 29 : 28;
  return m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31;
};

const pad = (n: number, width: number): string => String(n).padStart(width, "0");

const arbFraction = fc.option(
  fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 1, maxLength: 9 }).map((ds) => ds.join("")),
  { nil: undefined },
);

/**
 * ISO-8601 UTC Timestamps `YYYY-MM-DDTHH:MM:SS[.f{1,9}]Z` naming a real
 * calendar instant. The day is clamped to the month's length, so every
 * value passes `isTimestamp` by construction.
 */
export const arbTimestamp: fc.Arbitrary<string> = fc
  .record({
    year: fc.integer({ min: 0, max: 9999 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 31 }),
    hour: fc.integer({ min: 0, max: 23 }),
    minute: fc.integer({ min: 0, max: 59 }),
    second: fc.integer({ min: 0, max: 59 }),
    fraction: arbFraction,
  })
  .map((t) => {
    const day = Math.min(t.day, daysInMonth(t.year, t.month));
    const date = `${pad(t.year, 4)}-${pad(t.month, 2)}-${pad(day, 2)}`;
    const time = `${pad(t.hour, 2)}:${pad(t.minute, 2)}:${pad(t.second, 2)}`;
    return `${date}T${time}${t.fraction === undefined ? "" : `.${t.fraction}`}Z`;
  });

/** A string with at least one unpaired surrogate, and the Offset of the first one. */
export type LoneSurrogateString = Readonly<{ text: string; offset: number }>;

const lowSurrogate = fc.integer({ min: 0xdc00, max: 0xdfff });
const highSurrogate = fc.integer({ min: 0xd800, max: 0xdbff });
const notLowSurrogate = fc.oneof(
  fc.integer({ min: 0, max: 0xdbff }),
  fc.integer({ min: 0xe000, max: 0xffff }),
);

/** A lone low surrogate followed by anything. */
const loneLow = fc
  .tuple(lowSurrogate, arbAnyString)
  .map(([low, rest]) => String.fromCharCode(low) + rest);

/** A high surrogate at the end, or followed by a code unit that is not a low surrogate. */
const loneHigh = fc
  .tuple(highSurrogate, fc.option(fc.tuple(notLowSurrogate, arbAnyString), { nil: undefined }))
  .map(([high, tail]) => {
    const rest = tail === undefined ? "" : String.fromCharCode(tail[0]) + tail[1];
    return String.fromCharCode(high) + rest;
  });

/**
 * A prefix from `arbText` (which has no unpaired surrogate and never ends
 * inside a pair), then a lone surrogate, then any code units. The expected
 * Offset of the first unpaired surrogate is the prefix length, recorded at
 * generation time (Req 2.6, 7.3).
 */
export const arbStringWithLoneSurrogate: fc.Arbitrary<LoneSurrogateString> = fc
  .tuple(arbText, fc.oneof(loneLow, loneHigh))
  .map(([prefix, rest]) => ({ text: prefix + rest, offset: prefix.length }));

/** A half-open range `[start, end)` standing in for a citation range. */
export type CitationRange = Readonly<{ start: number; end: number }>;

/** Snaps left off Surrogate_Pair interiors, sorts, and drops duplicates. */
function toBoundaries(text: string, raw: readonly number[]): number[] {
  const snapped = raw.map((o) => (isValidBoundary(text, o) ? o : o - 1));
  return [...new Set(snapped)].sort((a, b) => a - b);
}

/** Pairs consecutive boundaries into non-empty ranges, dropping an odd last one. */
function pairUp(bounds: readonly number[]): CitationRange[] {
  const ranges: CitationRange[] = [];
  for (let i = 0; i + 1 < bounds.length; i += 2) {
    ranges.push({ start: bounds[i] as number, end: bounds[i + 1] as number });
  }
  return ranges;
}

/**
 * 0 to 10 sorted, non-overlapping, non-empty ranges within `t` whose ends
 * are Valid_Boundaries (never inside a Surrogate_Pair). Offsets are drawn
 * with `fc.integer` and snapped with `.map`, so shrinking still works.
 */
export function arbCitationRanges(t: string): fc.Arbitrary<readonly CitationRange[]> {
  if (t.length === 0) return fc.constant([]);
  return fc
    .array(fc.integer({ min: 0, max: t.length }), { maxLength: 20 })
    .map((raw) => pairUp(toBoundaries(t, raw)));
}

const lower = fc.integer({ min: 0x61, max: 0x7a }).map((u) => String.fromCharCode(u));
const upper = fc.integer({ min: 0x41, max: 0x5a }).map((u) => String.fromCharCode(u));

const arbLowerWord = fc.array(lower, { minLength: 1, maxLength: 10 }).map((cs) => cs.join(""));

/** `[A-Z][a-z]{0,11}`. */
export const arbCapitalisedWord: fc.Arbitrary<string> = fc
  .tuple(upper, fc.array(lower, { maxLength: 11 }))
  .map(([first, rest]) => first + rest.join(""));

/** One Legal_Abbreviation occurrence inside `arbAbbreviationProse` text. */
export type AbbreviationOccurrence = Readonly<{ abbreviation: string; start: number; end: number }>;

/** Prose with spliced Legal_Abbreviations, each at a recorded Offset. */
export type AbbreviationProse = Readonly<{
  text: string;
  abbreviations: readonly AbbreviationOccurrence[];
}>;

type ProseFragment =
  | Readonly<{ kind: "word"; word: string }>
  | Readonly<{ kind: "abbr"; abbreviation: string; next: string }>;

const arbProseFragment: fc.Arbitrary<ProseFragment> = fc.oneof(
  arbLowerWord.map((word): ProseFragment => ({ kind: "word", word })),
  fc
    .tuple(fc.constantFrom(...LEGAL_ABBREVIATIONS), arbCapitalisedWord)
    .map(([abbreviation, next]): ProseFragment => ({ kind: "abbr", abbreviation, next })),
);

/** Joins fragments with single spaces, recording each abbreviation's range. */
function joinProse(fragments: readonly ProseFragment[]): AbbreviationProse {
  const parts: string[] = [];
  const abbreviations: AbbreviationOccurrence[] = [];
  let at = 0;
  for (const f of fragments) {
    const piece = f.kind === "word" ? f.word : `${f.abbreviation} ${f.next}`;
    if (parts.length > 0) at += 1;
    if (f.kind === "abbr") {
      abbreviations.push({
        abbreviation: f.abbreviation,
        start: at,
        end: at + f.abbreviation.length,
      });
    }
    parts.push(piece);
    at += piece.length;
  }
  return { text: parts.join(" "), abbreviations };
}

/**
 * Lower-case prose words joined by single spaces, with Legal_Abbreviations
 * from the whole `LEGAL_ABBREVIATIONS` list spliced in, each followed by a
 * space and a Capitalised word (`Acme Co. Then`). Prose words hold no
 * period, so every `.` in the text belongs to a recorded abbreviation.
 * Each abbreviation is preceded by the start of the text or a space.
 */
export const arbAbbreviationProse: fc.Arbitrary<AbbreviationProse> = fc
  .array(arbProseFragment, { maxLength: 30 })
  .map(joinProse);
