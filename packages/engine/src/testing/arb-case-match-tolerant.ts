/**
 * Tolerant_Read arbitraries of the case-match spec (Property 3; Req 1.10,
 * 1.13 to 1.15): unlisted dotted abbreviations, apostrophe contractions,
 * tolerant case names and name boundaries. Built only from fast-check
 * combinators, so values shrink.
 */
import fc from "fast-check";
import { LEGAL_ABBREVIATION_INDEX } from "../citations/reporters.js";
import { arbPartyWords } from "./arb-case-match.js";

const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = "abcdefghijklmnopqrstuvwxyz";

const isListedAbbreviation = (w: string): boolean =>
  LEGAL_ABBREVIATION_INDEX.byLength.get(w.length)?.has(w) ?? false;

/** A capital, three to six lower-case letters and a period, not a Legal_Abbreviation (`Mgmt.`, `Hldgs.`). */
export const arbUnlistedAbbreviation: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom(...Array.from(UPPER)),
    fc.array(fc.constantFrom(...Array.from(LOWER)), {
      minLength: 3,
      maxLength: 6,
    }),
  )
  .map(([c, rest]) => `${c}${rest.join("")}.`)
  .filter((w) => !isListedAbbreviation(w));

/** One of the six listed contractions or a capital, lower-case letters, `'` and one lower-case letter. */
export const arbContraction: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom("Dep't", "Ass'n", "Comm'r", "Int'l", "Nat'l", "Gov't"),
  fc
    .tuple(
      fc.constantFrom(...Array.from(UPPER)),
      fc.array(fc.constantFrom(...Array.from(LOWER)), {
        minLength: 1,
        maxLength: 5,
      }),
      fc.constantFrom(...Array.from(LOWER)),
    )
    .map(([c, rest, last]) => `${c}${rest.join("")}'${last}`),
);

const TOLERANT_CONNECTORS = ["of", "the", "and", "for", "&", "de", "la"] as const;

/** A token and whether it may take a trailing comma (a comma is never last in a party). */
const arbPartyToken = (pool: string): fc.Arbitrary<string> =>
  fc.oneof(
    { arbitrary: arbPartyWords(pool, 1, 1).map((w) => w.join("")), weight: 4 },
    { arbitrary: arbUnlistedAbbreviation, weight: 2 },
    { arbitrary: arbContraction, weight: 2 },
  );

function tolerantParty(
  tokens: readonly string[],
  joiners: readonly (string | null)[],
  commas: readonly boolean[],
): string {
  const out: string[] = [];
  tokens.forEach((t, i) => {
    const last = i === tokens.length - 1;
    out.push(commas[i] === true && !last && t.endsWith(".") ? `${t},` : t);
    const joiner = joiners[i];
    if (!last && joiner !== null && joiner !== undefined) out.push(joiner);
  });
  return out.join(" ");
}

const arbTolerantParty = (pool: string): fc.Arbitrary<string> =>
  fc
    .tuple(
      fc.array(arbPartyToken(pool), { minLength: 1, maxLength: 5 }),
      fc.array(fc.option(fc.constantFrom(...TOLERANT_CONNECTORS), { nil: null }), { maxLength: 5 }),
      fc.array(fc.boolean(), { maxLength: 5 }),
    )
    .map(([tokens, joiners, commas]) => tolerantParty(tokens, joiners, commas));

/**
 * A Case_Name whose party words come from pooled words, unlisted dotted
 * abbreviations and contractions, with Tolerant_Read Connectors between
 * them. At most 164 code units by construction (two parties of at most five
 * tokens of at most ten code units, plus connectors).
 */
export function arbTolerantCaseName(pool: string): fc.Arbitrary<string> {
  return fc
    .tuple(arbTolerantParty(pool), arbTolerantParty(pool))
    .map(([a, b]) => `${a} v. ${b}`)
    .filter((n) => n.length <= 164);
}

const NOT_CONNECTORS: ReadonlySet<string> = new Set([
  "of",
  "the",
  "and",
  "for",
  "de",
  "la",
  "ex",
  "rel",
  "v",
]);

/** The text before a name: empty, a line break, or a lower-case non-Connector word and a space. */
export const arbNameBoundary: fc.Arbitrary<string> = fc.oneof(
  fc.constant(""),
  fc.constant("\n"),
  fc
    .tuple(
      fc.array(fc.constantFrom(...Array.from(LOWER)), {
        minLength: 2,
        maxLength: 8,
      }),
      fc.boolean(),
    )
    .map(([cs, period]) => `${cs.join("")}${period ? "." : ""} `)
    .filter((s) => !NOT_CONNECTORS.has(s.trim().replace(/\.$/, ""))),
);
