/**
 * Small quote-test arbitraries (design "Arbitraries" table; Req 13; Req
 * 22.1, 22.4): gap punctuation, following gaps, quote content, prose words,
 * Offset pairs, and quote-mark noise. Built from fast-check combinators only,
 * so every value shrinks.
 *
 * - `PROSE_WORDS` holds lower-case words that are not Connectors, not
 *   `with`, not a lowercase Gap_Signal or Gap_Signal word, and not `at`,
 *   so prose never supplies a gap word, a party word, or a Short_Form tail.
 * - `arbQuoteBody` is the structured form of `arbQuoteContent`: lower-case
 *   words, single spaces, and `,`, plus a flag for the optional final `.`.
 */
import fc from "fast-check";

/** Lower-case prose vocabulary; see the module comment for what it excludes. */
export const PROSE_WORDS: readonly string[] = [
  "held",
  "found",
  "noted",
  "argued",
  "because",
  "court",
  "ruled",
  "plaintiff",
  "motion",
  "filed",
  "here",
  "later",
  "counsel",
  "record",
];

/** One `PROSE_WORDS` entry. */
export const arbProseWord: fc.Arbitrary<string> = fc.constantFrom(...PROSE_WORDS);

/** One to six `PROSE_WORDS` entries joined by single spaces. */
export const arbProseWords: fc.Arbitrary<string> = fc
  .array(arbProseWord, { minLength: 1, maxLength: 6 })
  .map((ws) => ws.join(" "));

const GAP_UNITS: readonly string[] = [" ", "\n", ",", ";", ":", "(", ")", "."];

/** Drops every `.` after the first. */
function keepFirstDot(units: readonly string[]): string {
  let seen = false;
  return units
    .filter((u) => {
      if (u !== ".") return true;
      if (seen) return false;
      seen = true;
      return true;
    })
    .join("");
}

/** 0 to 6 code units from space, `\n`, `, ; : ( )`, with at most one `.`. */
export const arbGapPunct: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...GAP_UNITS), { maxLength: 6 })
  .map(keepFirstDot);

/** 0 to 4 code units from space and `, ; : (` (the Req 13.8 gap set). */
export const arbFollowGap: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(" ", ",", ";", ":", "("), { maxLength: 4 })
  .map((us) => us.join(""));

/** Longest quote body before a tail fix; with `x` and `.` content stays within 200. */
const MAX_BODY = 198;

const lowerLetter = fc.integer({ min: 0x61, max: 0x7a }).map((u) => String.fromCharCode(u));

/** A lower-case word, followed by `,` one time in four. */
const arbQuoteWord: fc.Arbitrary<string> = fc
  .tuple(
    fc.string({ unit: lowerLetter, minLength: 1, maxLength: 10 }),
    fc.integer({ min: 0, max: 3 }),
  )
  .map(([w, c]) => (c === 3 ? `${w},` : w));

/**
 * Lower-case last words of Legal_Abbreviations (`v.`, `et al.`). A body
 * ending in one, followed by `.`, would end with a Legal_Abbreviation, and
 * Req 8.6 would remove the boundary after the closing mark.
 */
const ABBREVIATION_TAILS: ReadonlySet<string> = new Set(["v", "al"]);

/** Joins words with single spaces, dropping trailing words past `MAX_BODY`. */
function joinBody(words: readonly string[]): string {
  let body = words[0] ?? "a";
  for (const w of words.slice(1)) {
    if (body.length + 1 + w.length > MAX_BODY) break;
    body = `${body} ${w}`;
  }
  const last = body.slice(body.lastIndexOf(" ") + 1);
  return ABBREVIATION_TAILS.has(last) ? `${body}x` : body;
}

/** Quote content before the optional final `.`, and whether that `.` is present. */
export type QuoteBody = Readonly<{ body: string; dot: boolean }>;

/** Structured quote content: no quotation mark, no digit, no inner terminator. */
export const arbQuoteBody: fc.Arbitrary<QuoteBody> = fc.record({
  body: fc.array(arbQuoteWord, { minLength: 1, maxLength: 20 }).map(joinBody),
  dot: fc.boolean(),
});

/** 1 to 200 code units of lower-case words, spaces, and `,`, with an optional final `.`. */
export const arbQuoteContent: fc.Arbitrary<string> = arbQuoteBody.map(
  (q) => q.body + (q.dot ? "." : ""),
);

/** Two Offsets `x < y` in `[0, t.length)`. */
export type OffsetPair = readonly [number, number];

/**
 * Two sorted, distinct Offsets in `[0, t.length)`, or `null` when `t` is
 * shorter than two code units. Draws `a, c` in `[0, len − 2]` and returns
 * `(min, max + 1)`, so shrinking still works.
 */
export function arbOffsetPair(t: string): fc.Arbitrary<OffsetPair | null> {
  if (t.length < 2) return fc.constant(null);
  const n = fc.integer({ min: 0, max: t.length - 2 });
  return fc.tuple(n, n).map(([a, c]): OffsetPair => [Math.min(a, c), Math.max(a, c) + 1]);
}

/**
 * Quote-mark noise pieces: stray, unterminated, mixed, empty, and blank
 * marks, plus pieces whose pairs nest or cross (Req 13.6, 13.10). Every
 * piece starts and ends with a quotation mark, so inserting it next to a
 * citation never glues a letter or digit to it (Req 9.8).
 */
export const QUOTE_NOISE: readonly string[] = [
  '"',
  "“",
  "”",
  '""',
  "“”",
  '" "',
  "“ ”",
  '“"',
  '"”',
  "“a “b” c”",
  '"a “b” c"',
  '"a “b" c”',
  '“a "b” c"',
];

/** One to six `QUOTE_NOISE` pieces, to be inserted by the caller. */
export const arbQuoteNoise: fc.Arbitrary<readonly string[]> = fc.array(
  fc.constantFrom(...QUOTE_NOISE),
  { minLength: 1, maxLength: 6 },
);
