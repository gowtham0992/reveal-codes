/**
 * `arbInitialProse` (design "Arbitraries" table; Req 8.10, 22.1): prose with
 * Single_Capital_Initial cases spliced in, for Property 15. Each case is
 * built around one `.` and records whether a Sentence boundary follows it,
 * by construction. Built only from fast-check combinators, so values shrink.
 */
import fc from "fast-check";
import { LEGAL_ABBREVIATIONS } from "../abbreviations.js";
import { exactIndex, LEGAL_ABBREVIATION_INDEX } from "../citations/reporters.js";
import { arbInitial } from "./arb-case-name.js";
import { arbCapitalisedWord } from "./arb-text.js";

/** The initial cases; the first three do not split, the rest do. */
export type InitialCase =
  | "joined"
  | "chain"
  | "reporter"
  | "lowercase"
  | "digit"
  | "vee"
  | "etal"
  | "twoSpaces"
  | "newline"
  | "closer"
  | "twoLetters"
  | "glued"
  | "paren";

/**
 * One tested `.`: its Offset `dot`, the Offset `after` of the first
 * non-whitespace code unit after its terminator sequence, and whether a
 * Sentence boundary is at `after`.
 */
export type InitialOccurrence = Readonly<{
  kind: InitialCase;
  dot: number;
  after: number;
  splits: boolean;
}>;

export type InitialProse = Readonly<{ text: string; initials: readonly InitialOccurrence[] }>;

/** A fragment: its text and its occurrences with Offsets relative to it. */
type Fragment = Readonly<{ piece: string; initials: readonly InitialOccurrence[] }>;

const lower = fc.integer({ min: 0x61, max: 0x7a }).map((u) => String.fromCharCode(u));
const upper = fc.integer({ min: 0x41, max: 0x5a }).map((u) => String.fromCharCode(u));
const arbLowerWord = fc.array(lower, { minLength: 1, maxLength: 8 }).map((cs) => cs.join(""));
const arbDigits = fc.integer({ min: 0, max: 9999 }).map(String);

/** Legal_Abbreviations that are Capitalised_Words as one `W` run (not `v.`, `et al.`). */
const arbFollowingAbbreviation = fc.constantFrom(
  ...LEGAL_ABBREVIATIONS.filter((a) => a !== "v." && a !== "et al."),
);

/** The one-letter reporter abbreviations, which Req 8.6 already excludes. */
const arbReporterInitial = fc.constantFrom(...["A.", "F.", "P."].filter((a) => exactIndex.has(a)));

/** `XY.` that is not a Legal_Abbreviation. */
const arbTwoLetters = fc
  .tuple(upper, upper)
  .map(([a, b]) => `${a}${b}.`)
  .filter((w) => !(LEGAL_ABBREVIATION_INDEX.byLength.get(3)?.has(w) ?? false));

const one = (
  kind: InitialCase,
  piece: string,
  dot: number,
  gap: number,
  splits: boolean,
): Fragment => ({
  piece,
  initials: [{ kind, dot, after: dot + 1 + gap, splits }],
});

/** Cases with one tested `.` followed by `tail`; `gap` units sit between `.` and `after`. */
const singles: fc.Arbitrary<Fragment> = fc.oneof(
  fc
    .tuple(arbInitial, fc.oneof(arbCapitalisedWord, arbFollowingAbbreviation))
    .map(([i, w]) => one("joined", `${i} ${w}`, 1, 1, false)),
  fc
    .tuple(arbReporterInitial, arbLowerWord)
    .map(([i, w]) => one("reporter", `${i} ${w}`, 1, 1, false)),
  fc.tuple(arbInitial, arbLowerWord).map(([i, w]) => one("lowercase", `${i} ${w}`, 1, 1, true)),
  fc.tuple(arbInitial, arbDigits).map(([i, d]) => one("digit", `${i} ${d}`, 1, 1, true)),
  fc.tuple(arbInitial, arbCapitalisedWord).map(([i, w]) => one("vee", `${i} v. ${w}`, 1, 1, true)),
  arbInitial.map((i) => one("etal", `${i} et al.`, 1, 1, true)),
  fc
    .tuple(arbInitial, arbCapitalisedWord)
    .map(([i, w]) => one("twoSpaces", `${i}  ${w}`, 1, 2, true)),
  fc
    .tuple(arbInitial, arbCapitalisedWord)
    .map(([i, w]) => one("newline", `${i}\n${w}`, 1, 1, true)),
  fc.tuple(arbInitial, arbCapitalisedWord).map(([i, w]) => one("closer", `${i}) ${w}`, 1, 2, true)),
  fc
    .tuple(arbTwoLetters, arbCapitalisedWord)
    .map(([i, w]) => one("twoLetters", `${i} ${w}`, 2, 1, true)),
  fc
    .tuple(lower, arbInitial, arbCapitalisedWord)
    .map(([x, i, w]) => one("glued", `${x}${i} ${w}`, 2, 1, true)),
  fc.tuple(arbInitial, arbCapitalisedWord).map(([i, w]) => one("paren", `(${i} ${w}`, 2, 1, true)),
);

/** `J. K. Smith`: both initials are followed by one space and a Capitalised_Word. */
const chain: fc.Arbitrary<Fragment> = fc
  .tuple(arbInitial, arbInitial, arbCapitalisedWord)
  .map(([a, b, w]): Fragment => ({
    piece: `${a} ${b} ${w}`,
    initials: [
      { kind: "chain", dot: 1, after: 3, splits: false },
      { kind: "chain", dot: 4, after: 6, splits: false },
    ],
  }));

const arbFragment: fc.Arbitrary<Fragment> = fc.oneof(
  { arbitrary: arbLowerWord.map((piece): Fragment => ({ piece, initials: [] })), weight: 2 },
  { arbitrary: singles, weight: 4 },
  { arbitrary: chain, weight: 1 },
);

/** Joins fragments with single spaces, shifting each occurrence's Offsets. */
function joinFragments(fragments: readonly Fragment[]): InitialProse {
  const initials: InitialOccurrence[] = [];
  let at = 0;
  for (const [k, f] of fragments.entries()) {
    if (k > 0) at += 1;
    for (const o of f.initials) initials.push({ ...o, dot: o.dot + at, after: o.after + at });
    at += f.piece.length;
  }
  return { text: fragments.map((f) => f.piece).join(" "), initials };
}

/**
 * Up to 30 fragments joined by single spaces: lower-case prose words and the
 * `InitialCase` shapes. Every `.` in the text is a recorded `dot` or a period
 * of a Legal_Abbreviation preceded by a space, so the text's Sentence
 * boundaries are exactly the recorded `after` Offsets with `splits` true.
 */
export const arbInitialProse: fc.Arbitrary<InitialProse> = fc
  .array(arbFragment, { maxLength: 30 })
  .map(joinFragments);
