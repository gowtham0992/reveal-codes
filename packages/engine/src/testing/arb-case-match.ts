/**
 * Arbitraries of the case-match spec (design D10 and the "Arbitraries"
 * table; Req 13.3, 1.10, 3.3, 3.4): party words and case names drawn from a
 * letter pool, In_Re_Names, lead-ins, name variants, disjoint names, found
 * names with Reveal Codes special characters, `wrong_case` results, and the
 * pieces of the Tolerant_Read (unlisted abbreviations, contractions, tolerant
 * case names, name boundaries).
 *
 * `arbCaseName` of `arb-case-name.ts` already names the pool-free Case_Name
 * arbitrary used by other properties, so the pooled one is `arbPooledCaseName`.
 *
 * The verifier tables are copied here as plain data because the Engine does
 * not depend on the verifier. Built only from fast-check combinators, so
 * values shrink.
 */
import fc from "fast-check";
import { ENTITY_SUFFIX_WORDS } from "../abbreviations.js";
import { SIGNALS } from "../citations/signals.js";
import type { VerificationResult } from "../types.js";
import { LIVE_STOP_ENTRIES } from "./arb-case-name.js";

const SAMPLE_LETTERS = "abcxyzABCXYZ019";

/** The letters of the two disjoint pools of Property 1. */
export const POOL_A_M = "abcdefghijklm";
export const POOL_N_Z = "nopqrstuvwxyz";

/** The thirty Name_Expansion_Table entries (abbreviation key and expansion words). */
export const EXPANSION_ENTRIES: readonly (readonly [string, readonly string[]])[] = [
  ["dept", ["department"]],
  ["us", ["united", "states"]],
  ["commr", ["commissioner"]],
  ["govt", ["government"]],
  ["bd", ["board"]],
  ["educ", ["education"]],
  ["ins", ["insurance"]],
  ["mfg", ["manufacturing"]],
  ["sch", ["school"]],
  ["ry", ["railway"]],
  ["rr", ["railroad"]],
  ["hous", ["housing"]],
  ["fedn", ["federation"]],
  ["socy", ["society"]],
  ["ctr", ["center"]],
  ["sys", ["system"]],
  ["servs", ["services"]],
  ["mgmt", ["management"]],
  ["assn", ["association"]],
  ["intl", ["international"]],
  ["natl", ["national"]],
  ["bros", ["brothers"]],
  ["univ", ["university"]],
  ["hosp", ["hospital"]],
  ["auth", ["authority"]],
  ["cnty", ["county"]],
  ["commn", ["commission"]],
  ["props", ["properties"]],
  ["cos", ["companies"]],
  ["assocs", ["associates"]],
];

/** The Dropped_Words of the name rule. */
const DROPPED: readonly string[] = [
  "v",
  "vs",
  "in",
  "re",
  "the",
  "of",
  "and",
  "et",
  "al",
  "ex",
  "rel",
  "inc",
  "co",
  "corp",
  "corporation",
  "company",
  "llc",
  "ltd",
  "lp",
  "llp",
  "plc",
  "na",
];

const RESERVED: ReadonlySet<string> = new Set([...DROPPED, ...EXPANSION_ENTRIES.map(([k]) => k)]);
const LIVE_STOPS: ReadonlySet<string> = new Set(LIVE_STOP_ENTRIES);
const capitalise = (w: string): string => w.charAt(0).toUpperCase() + w.slice(1);

const lowerFrom = (pool: string): fc.Arbitrary<string> => fc.constantFrom(...Array.from(pool));

/** One to four capitalised words of 4 to 8 letters of `pool`, never a reserved word. */
export function arbPartyWords(pool: string, min = 1, max = 4): fc.Arbitrary<readonly string[]> {
  const word = fc
    .array(lowerFrom(pool), { minLength: 4, maxLength: 8 })
    .map((cs) => cs.join(""))
    .filter((w) => !RESERVED.has(w))
    .map(capitalise)
    .filter((w) => !LIVE_STOPS.has(w));
  return fc.array(word, { minLength: min, maxLength: max });
}

const arbSuffix: fc.Arbitrary<string | null> = fc.oneof(
  fc.constant(null),
  fc.constantFrom(...ENTITY_SUFFIX_WORDS),
);

/** `<Party> v. <Party>` over `arbPartyWords(pool)`, the second party with an optional Entity_Suffix. */
export function arbPooledCaseName(pool: string): fc.Arbitrary<string> {
  return fc.tuple(arbPartyWords(pool), arbPartyWords(pool), arbSuffix).map(([a, b, suffix]) => {
    const second = b.join(" ");
    return `${a.join(" ")} v. ${suffix === null ? second : `${second}, ${suffix}`}`;
  });
}

/** `In re <Name>`, with commas inside the name, at most 80 code units. */
export const arbInReName: fc.Arbitrary<string> = fc
  .tuple(arbPartyWords(POOL_A_M, 1, 4), fc.array(fc.boolean(), { maxLength: 4 }))
  .map(([words, commas]) => {
    const body = words.map((w, i) => (commas[i] === true && i < words.length - 1 ? `${w},` : w));
    return `In re ${body.join(" ")}`.slice(0, 80).replace(/[ ,]+$/, "");
  });

/** The empty string, a Signal, or one of `In`, `As`, `Under`, `Following`, `Applying`, `The court in`. */
export const arbLeadIn: fc.Arbitrary<string> = fc.constantFrom(
  "",
  ...SIGNALS,
  "In",
  "As",
  "Under",
  "Following",
  "Applying",
  "The court in",
);

/** A cited and found form of one name, and whether `namesMatch` must hold. */
export type NameVariant = Readonly<{
  kind: "identity" | "case" | "punctuation" | "expand" | "contract" | "initialism";
  cited: string;
  found: string;
  expected: true;
}>;

const partiesOf = (name: string): readonly [string, string] => {
  const at = name.indexOf(" v. ");
  return at < 0 ? [name, name] : [name.slice(0, at), name.slice(at + 4)];
};

const stripPunctuation = (s: string): string => s.replace(/[^\p{L}\p{N}\s]/gu, "");

const expansionText = (words: readonly string[]): string => words.map(capitalise).join(" ");

/** The initialism of `words` in capitals, or null when the rule cannot represent it (D10). */
function initialismOf(words: readonly string[]): string | null {
  const initials = words.map((w) => w.charAt(0)).join("");
  return RESERVED.has(initials.toLowerCase()) ? null : initials.toUpperCase();
}

function arbExpandVariant(second: string): fc.Arbitrary<NameVariant> {
  return fc
    .tuple(fc.constantFrom(...EXPANSION_ENTRIES), fc.boolean())
    .map(([[key, words], cited]): NameVariant => {
      const abbreviated = `${capitalise(key)}.`;
      const long = expansionText(words);
      return cited
        ? {
            kind: "expand",
            cited: `${abbreviated} v. ${second}`,
            found: `${long} v. ${second}`,
            expected: true,
          }
        : {
            kind: "contract",
            cited: `${long} v. ${second}`,
            found: `${abbreviated} v. ${second}`,
            expected: true,
          };
    });
}

function arbInitialismVariant(second: string): fc.Arbitrary<NameVariant> {
  return arbPartyWords(POOL_A_M, 3, 4)
    .filter((words) => initialismOf(words) !== null)
    .map((words): NameVariant => ({
      kind: "initialism",
      cited: `${initialismOf(words) ?? ""} v. ${second}`,
      found: `${words.join(" ")} v. ${second}`,
      expected: true,
    }));
}

/**
 * Variants of `name` (a `<Party> v. <Party>` string) that must match it:
 * identity, a case change, punctuation removal, a table abbreviation against
 * its expansion in either direction, and the initialism of a party of at
 * least three words. An initialism equal to a Dropped_Word or a table key is
 * excluded (D10).
 */
export function arbNameVariant(name: string): fc.Arbitrary<NameVariant> {
  const [first, second] = partiesOf(name);
  const identity = fc.constant<NameVariant>({
    kind: "identity",
    cited: name,
    found: name,
    expected: true,
  });
  const changed = fc
    .constantFrom(
      (s: string) => s.toUpperCase(),
      (s: string) => s.toLowerCase(),
    )
    .map((f): NameVariant => ({ kind: "case", cited: f(name), found: name, expected: true }));
  const bare = fc.constant<NameVariant>({
    kind: "punctuation",
    cited: `${stripPunctuation(first)} v. ${stripPunctuation(second)}`,
    found: name,
    expected: true,
  });
  const expand = arbExpandVariant(second);
  const initialism = arbInitialismVariant(second);
  return fc.oneof(identity, changed, bare, expand, initialism);
}

/** A cited name from the `a-m` pool and a found name from the `n-z` pool; no shared word. */
export const arbDisjointNames: fc.Arbitrary<Readonly<{ cited: string; found: string }>> = fc
  .tuple(
    fc.tuple(arbPartyWords(POOL_A_M), arbPartyWords(POOL_A_M)),
    fc.tuple(arbPartyWords(POOL_N_Z), arbPartyWords(POOL_N_Z)),
  )
  .map(([[ca, cb], [fa, fb]]) => ({
    cited: `${ca.join(" ")} v. ${cb.join(" ")}`,
    found: `${fa.join(" ")} v. ${fb.join(" ")}`,
  }));

const arbLetter: fc.Arbitrary<string> = fc.constantFrom(...Array.from(SAMPLE_LETTERS));
const arbNonAscii: fc.Arbitrary<string> = fc.constantFrom(
  "é",
  "ß",
  "Ж",
  "ñ",
  "ö",
  "ا",
  "\u{1D400}",
);
const arbSpecial: fc.Arbitrary<string> = fc.constantFrom("[", "]", "{", "}", ";", ":", '"', "\\");
const arbEscape: fc.Arbitrary<string> = fc.constantFrom(
  "\\n",
  "\\\\",
  "\\]",
  "\\;",
  "\\u00e9",
  '\\"',
);

/** A found name: non-empty, no edge whitespace, Reveal Codes special characters and non-ASCII letters. */
export const arbFoundName: fc.Arbitrary<string> = fc
  .tuple(
    arbLetter,
    fc.array(fc.oneof(arbLetter, arbLetter, fc.constant(" "), arbSpecial, arbEscape, arbNonAscii), {
      maxLength: 30,
    }),
    arbLetter,
  )
  .map(([head, middle, tail]) => `${head}${middle.join("")}${tail}`);

/** A `wrong_case` result: a cluster id, a found name and an optional year of 1000 to 9999. */
export type WrongCaseResult = Extract<VerificationResult, { status: "wrong_case" }>;

export const arbWrongCaseResult: fc.Arbitrary<WrongCaseResult> = fc
  .tuple(
    fc.string({ minLength: 1, maxLength: 8 }),
    arbFoundName,
    fc.option(fc.integer({ min: 1000, max: 9999 }), { nil: undefined }),
  )
  .map(([clusterId, foundName, foundYear]) =>
    foundYear === undefined
      ? { status: "wrong_case", clusterId, foundName }
      : { status: "wrong_case", clusterId, foundName, foundYear },
  );
