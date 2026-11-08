import * as fc from "fast-check";
import { format } from "@reveal-codes/engine";
import { trackQuote } from "../../src/track";
// The engine's `testing/` folder is deliberately not exported from its index (engine Req 1.2).
import { arbReporterValue } from "../../../engine/src/testing/arb-citation";
import { arbOpinionWithQuotes } from "../../../engine/src/testing/arb-opinion";

/** A pincite-free Citation_Line built from the engine's `arbReporterValue`. */
export const arbCitationLine: fc.Arbitrary<string> = arbReporterValue.chain((v) => {
  const r = format({ kind: "reporter", volume: v.volume, reporter: v.reporter, page: v.page });
  return r.ok ? fc.constant(r.value) : fc.constant("1 U.S. 1");
});

/** A line over 64 000 characters; the repeat count is shrinkable, the first character keeps lines distinct. */
export const arbVeryLongLine: fc.Arbitrary<string> = fc
  .tuple(fc.integer({ min: 64_001, max: 70_000 }), fc.nat({ max: 9 }))
  .map(([n, d]) => String(d).repeat(n));

/** A line of 10 000 to 40 000 characters, so joined bodies approach the 64 000 cap. */
export const arbBulkyLine: fc.Arbitrary<string> = fc
  .tuple(fc.integer({ min: 10_000, max: 40_000 }), fc.nat({ max: 9 }))
  .map(([n, d]) => String(d).repeat(n));

/** Lists of distinct Citation_Lines with occasional bulky and over-64 000 lines (Property 4). */
export const arbChunkInput: fc.Arbitrary<string[]> = fc.uniqueArray(
  fc.oneof(
    { weight: 20, arbitrary: arbCitationLine },
    { weight: 2, arbitrary: arbBulkyLine },
    { weight: 1, arbitrary: arbVeryLongLine },
  ),
  { minLength: 0, maxLength: 200 },
);

/** Fragments that stress each stage of the Normalisation_Pipeline (Property 7). */
const normalisableFragment: fc.Arbitrary<string> = fc.oneof(
  { weight: 6, arbitrary: fc.string({ unit: "grapheme-ascii", maxLength: 6 }) },
  {
    weight: 6,
    arbitrary: fc.constantFrom("“", "”", "‘", "’", "‚", "–", "—", "[", "]", "[...]", ".[.]."),
  },
  { weight: 6, arbitrary: fc.constantFrom(".", "..", "...", ". . .", "…", ",", ";", ":") },
  {
    weight: 5,
    arbitrary: fc.constantFrom("\t", "\u0085", "\u00a0", "\ufeff", "\u2028", "\u3000", " ", "\n"),
  },
  { weight: 3, arbitrary: fc.constantFrom("\u0300", "\u0301", "\u0323", "e\u0301", "a\u0308") },
  { weight: 2, arbitrary: fc.constantFrom("\ud800", "\udc00", "\ud83d\ude00", "\ud83d") },
  { weight: 2, arbitrary: fc.constantFrom("\u1100", "\u1161", "\u11a8", "\uac00", "\u1100\u1161") },
  { weight: 1, arbitrary: fc.constantFrom("İ", "ǅ", "ß", "Σ") },
);

/** Strings built from pipeline-relevant fragments (Property 7). */
export const arbNormalisable: fc.Arbitrary<string> = fc
  .array(normalisableFragment, { maxLength: 14 })
  .map((parts) => parts.join(""));

// ---- Property 8 (quote typesetting) ----

/** Any ellipsis form of Req 8.2 step 5, or an alteration bracket. */
const ELLIPSIS_OR_BRACKET = /…|\.(?:\s*\.){2,}|[[\]]/;
const MIN_SEGMENT = 12;

/** Tail removal of Req 8.3 applied to one candidate segment, for the length floor of Req 8.12. */
function floorLength(segment: string): number {
  return segment.replace(/[\s.,;:]+$/u, "").length;
}

/** An opinion text with no ellipsis form and no bracket, long enough to cut a segment from. */
export const arbQuoteSource: fc.Arbitrary<string> = arbOpinionWithQuotes
  .map((o) => o.text)
  .filter((t) => !ELLIPSIS_OR_BRACKET.test(t) && floorLength(t.trim()) >= MIN_SEGMENT);

type Cut = { readonly start: number; readonly end: number };

/** Word-boundary starts (after whitespace or at 0) and ends (before whitespace or at the end). */
function boundaries(text: string): { starts: number[]; ends: number[] } {
  const starts: number[] = [];
  const ends: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const here = /\s/u.test(text.charAt(i));
    const before = i === 0 || /\s/u.test(text.charAt(i - 1));
    if (!here && before) starts.push(i);
    if (!here && (i === text.length - 1 || /\s/u.test(text.charAt(i + 1)))) ends.push(i + 1);
  }
  return { starts, ends };
}

/** Choose in-order, non-overlapping, word-boundary cuts, each over the floor; never empty. */
function chooseCuts(text: string, picks: ReadonlyArray<readonly [number, number]>): Cut[] {
  const { starts, ends } = boundaries(text);
  const cuts: Cut[] = [];
  let prevEnd = 0;
  for (const [u, v] of picks) {
    const startOptions = starts.filter((s) => s >= prevEnd);
    if (startOptions.length === 0) break;
    const start = startOptions[u % startOptions.length] as number;
    const endOptions = ends.filter(
      (e) => e > start && floorLength(text.slice(start, e)) >= MIN_SEGMENT,
    );
    if (endOptions.length === 0) continue;
    const end = endOptions[v % endOptions.length] as number;
    cuts.push({ start, end });
    prevEnd = end;
  }
  if (cuts.length > 0) return cuts;
  const whole = text.trim();
  return [{ start: text.indexOf(whole), end: text.indexOf(whole) + whole.length }];
}

const arbPick: fc.Arbitrary<readonly [number, number]> = fc.tuple(fc.nat(), fc.nat());

/** An opinion and one to three lifted segments of it (the first and last may be anywhere). */
export const arbLiftedSegments: fc.Arbitrary<{ text: string; segments: string[] }> = fc
  .tuple(arbQuoteSource, fc.array(arbPick, { minLength: 1, maxLength: 3 }))
  .map(([text, picks]) => ({
    text,
    segments: chooseCuts(text, picks).map((c) => text.slice(c.start, c.end)),
  }));

/** A function joining segments by ellipsis forms `…`, `...`, `. . .`, optionally space-padded. */
export const arbEllipsisJoin: fc.Arbitrary<(segments: readonly string[]) => string> = fc
  .array(
    fc.record({
      form: fc.constantFrom("…", "...", ". . ."),
      before: fc.boolean(),
      after: fc.boolean(),
    }),
    { minLength: 2, maxLength: 2 },
  )
  .map((joins) => (segments) => {
    let out = segments[0] ?? "";
    for (let i = 1; i < segments.length; i += 1) {
      const j = joins[i - 1] ?? { form: "…", before: false, after: false };
      out += `${j.before ? " " : ""}${j.form}${j.after ? " " : ""}${segments[i] as string}`;
    }
    return out;
  });

/** How a lifted quote is retyped: curly marks, and White_Space runs of the same or greater length. */
export type Typeset = {
  readonly curly: boolean;
  readonly extra: ReadonlyArray<number>;
  readonly kinds: ReadonlyArray<number>;
};

export const arbTypeset: fc.Arbitrary<Typeset> = fc.record({
  curly: fc.boolean(),
  extra: fc.array(fc.nat({ max: 3 }), { minLength: 1, maxLength: 6 }),
  kinds: fc.array(fc.nat(), { minLength: 1, maxLength: 6 }),
});

const WIDE_SPACES = [" ", "\t", "\u00a0", "\u2003", "\u0085", "\u3000", "\n", "\u2028"];
const SPACE_RUN = /[\t-\r \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/gu;

/** Apply a `Typeset` to a quote. */
export function typeset(quote: string, t: Typeset): string {
  let n = 0;
  const spaced = quote.replace(SPACE_RUN, (run) => {
    const kind = WIDE_SPACES[
      (t.kinds[n % t.kinds.length] as number) % WIDE_SPACES.length
    ] as string;
    const extra = t.extra[n % t.extra.length] as number;
    n += 1;
    return kind.repeat(run.length + extra);
  });
  if (!t.curly) return spaced;
  let open = true;
  return spaced.replace(/["']/gu, (ch) => {
    const out = ch === '"' ? (open ? "“" : "”") : "’";
    if (ch === '"') open = !open;
    return out;
  });
}
// ---- Property 9 (altered quotation, prefixLength) ----

/** A lifted contiguous quote with one interior word replaced by a word absent from the opinion. */
export type AlteredQuote = {
  readonly opinion: string;
  readonly altered: string;
  /** Offset of the replaced word in `altered`. */
  readonly offset: number;
};

/** Words that cannot occur in an opinion built by `arbOpinionWithQuotes` (checked by the filter). */
const arbAbsentWord: fc.Arbitrary<string> = fc
  .array(fc.constantFrom("q", "z", "x", "j", "v"), { minLength: 8, maxLength: 12 })
  .map((cs) => cs.join(""));

function tokenSpans(quote: string): Array<{ start: number; end: number }> {
  return [...quote.matchAll(/\S+/gu)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
  }));
}

/** Alter one interior token of a word-boundary lifted quote; undefined when the quote cannot host one. */
function alterQuote(opinion: string, pick: readonly [number, number, number], word: string) {
  const { starts, ends } = boundaries(opinion);
  const start = starts[pick[0] % starts.length] as number;
  const endOptions = ends.filter((e) => e > start && e - start >= MIN_SEGMENT);
  if (endOptions.length === 0) return undefined;
  const end = endOptions[pick[1] % endOptions.length] as number;
  const quote = opinion.slice(start, end);
  const tokens = tokenSpans(quote);
  if (tokens.length < 3) return undefined;
  const t = tokens[1 + (pick[2] % (tokens.length - 2))] as { start: number; end: number };
  const altered = quote.slice(0, t.start) + word + quote.slice(t.end);
  const normalAbsent = !opinion.toLowerCase().includes(word);
  if (!normalAbsent || altered.replace(/[\s.,;:]+$/u, "").length < MIN_SEGMENT) return undefined;
  return { opinion, altered, offset: t.start };
}

export const arbAlteredQuote: fc.Arbitrary<AlteredQuote> = fc
  .tuple(arbQuoteSource, fc.tuple(fc.nat(), fc.nat(), fc.nat()), arbAbsentWord)
  .map(([opinion, pick, word]) => alterQuote(opinion, pick, word))
  .filter((x): x is AlteredQuote => x !== undefined);

/** Vocabulary shared by small adversarial opinions and quotes, so partial matches are common. */
const ADVERSARIAL_TOKENS = [
  "a",
  "b",
  "ab",
  "the court",
  "remanded the case",
  "see id",
  "burdens speech",
  "caf\u00e9",
  "cafe\u0301",
  "[x]",
  "[a b]",
  "[[a]b]",
  "[",
  "]",
  "e\u0301",
  "x\u0323",
  "\u0301",
  "\u1100\u1161",
  "x.",
  ",",
];

/** Quote vocabulary: the shared one minus tokens NFC would change, plus NFC-stable marks and jamo. */
const QUOTE_TOKENS = [
  ...ADVERSARIAL_TOKENS.filter((t) => t.normalize("NFC") === t),
  "x\u0323\u0301",
  "a\u11a8",
  "\u1161",
];

const arbTokens = (max: number): fc.Arbitrary<string[]> =>
  fc.array(fc.constantFrom(...QUOTE_TOKENS), { minLength: 1, maxLength: max });

const arbJoinForm: fc.Arbitrary<string> = fc.constantFrom(
  "…",
  "...",
  " ... ",
  ". . .",
  " … ",
  "[...]",
);

/** A small opinion and a one-to-three segment quote, each from the shared vocabulary. */
export const arbAdversarialPair: fc.Arbitrary<{ opinion: string; quote: string }> = fc
  .tuple(
    fc.array(fc.oneof(fc.constantFrom(...ADVERSARIAL_TOKENS), fc.constant("...")), {
      minLength: 1,
      maxLength: 12,
    }),
    fc.array(arbTokens(5), { minLength: 1, maxLength: 3 }),
    fc.array(arbJoinForm, { minLength: 2, maxLength: 2 }),
    fc.boolean(),
  )
  .map(([oTokens, segs, forms, trailing]) => {
    let quote = (segs[0] as string[]).join(" ");
    for (let i = 1; i < segs.length; i += 1) {
      quote += `${forms[i - 1] as string}${(segs[i] as string[]).join(" ")}`;
    }
    return { opinion: oTokens.join(" "), quote: trailing ? `${quote}.` : quote };
  })
  // Known limitation L3: when NFC changes the quote, tracking is abandoned and prefixLength
  // may be smaller than the largest n. Joins can still compose (a jamo after a syllable), so
  // the model comparison is kept to quotes where tracking holds.
  .filter((p) => trackQuote(p.quote) !== null);
