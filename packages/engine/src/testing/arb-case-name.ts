/**
 * Party_Name, Case_Name, and Signal arbitraries (design "Arbitraries" table;
 * Glossary Party_Name, Case_Name, Entity_Suffix, Signal, Gap_Signal; D11,
 * D19; Req 22.1, 22.4).
 *
 * - `arbPartyName`: 1 to 6 tokens, each a decorated capitalised word, a
 *   Single_Capital_Initial, or a Legal_Abbreviation other than `Id.`, `v.`,
 *   and the reporter abbreviations (D11). Any token but the last may carry a
 *   `,`, at most one token is a digit run, and an Entity_Suffix follows with
 *   probability ½. Trimmed to `MAX_PARTY` (suffix dropped first), and a
 *   leading Signal is replaced by `Smith`.
 * - `arbCaseName`: two Party_Names joined by ` v. ` and closed by `,`. Only
 *   one of the two may hold a digit run, so no `<digits> … <digits>` pattern
 *   can span the joiner and the value stays citation-free (P48).
 * - `arbSignal`, `arbGapSignal`: the `SIGNALS` and `GAP_SIGNALS` lists.
 * - `arbLongParty`: an `arbPartyName` padded on the left with capitalised
 *   words to 81 to 120 code units.
 *
 * The Short_Form_Party arbitraries live in `arb-short-form-party.ts`, which
 * imports the shared word pieces below. Everything is built from fast-check
 * combinators, so values shrink.
 */
import fc from "fast-check";
import { ENTITY_SUFFIX_WORDS, LEGAL_ABBREVIATIONS } from "../abbreviations.js";
import { isCapitalisedWord, MAX_PARTY, PARTY_STOP_LIST } from "../citations/party.js";
import { exactIndex } from "../citations/reporters.js";
import { GAP_SIGNALS, SIGNALS, startsWithSignal } from "../citations/signals.js";
import { arbCapitalisedWord } from "./arb-text.js";

/** Legal_Abbreviations usable in a party: not `Id.`, `v.`, or a reporter (D11, D16). */
export const PARTY_ABBREVIATIONS: readonly string[] = LEGAL_ABBREVIATIONS.filter(
  (a) => a !== "Id." && a !== "v." && !exactIndex.has(a),
);

/** Capitals whose `X.` is not a reporter abbreviation (`A.`, `F.`, `P.` are). */
const INITIAL_LETTERS: readonly string[] = Array.from({ length: 26 }, (_, i) =>
  String.fromCharCode(65 + i),
).filter((c) => !exactIndex.has(`${c}.`));

/**
 * The live Party_Stop_List entries: those whose every word is a
 * Capitalised_Word, so they can begin a Party_Run (`See`, `In`, …).
 */
export const LIVE_STOP_ENTRIES: readonly string[] = PARTY_STOP_LIST.filter((entry) =>
  entry.every((w) => isCapitalisedWord(w, 0, w.length)),
).map((entry) => entry.join(" "));

const LIVE_STOP_SET: ReadonlySet<string> = new Set(LIVE_STOP_ENTRIES);

/** `w`, or `Smith` when `w` is a live Party_Stop_List entry. */
export const notLiveStop = (w: string): string => (LIVE_STOP_SET.has(w) ? "Smith" : w);

/** `[A-Z][a-z]{0,8}`, the word after a hyphen. */
const arbHyphenWord: fc.Arbitrary<string> = arbCapitalisedWord.map((w) => w.slice(0, 9));

/** A capitalised word, optionally with `'s`, `’s`, or `-[A-Z][a-z]{0,8}`. */
export const arbPartyWord: fc.Arbitrary<string> = fc
  .tuple(
    arbCapitalisedWord,
    fc.oneof(
      { arbitrary: fc.constant(""), weight: 3 },
      fc.constantFrom("'s", "’s"),
      arbHyphenWord.map((w) => `-${w}`),
    ),
  )
  .map(([w, d]) => w + d);

/**
 * A Single_Capital_Initial such as `J.`, never a reporter abbreviation. An
 * initial followed by ` v. `, ` et al.`, or a digit run ends a Sentence
 * (Req 8.10 does not apply) unless it is a reporter abbreviation (Req 8.6),
 * so excluding `A.`, `F.`, and `P.` keeps boundary counts exact.
 */
export const arbInitial: fc.Arbitrary<string> = fc
  .constantFrom(...INITIAL_LETTERS)
  .map((c) => `${c}.`);

/** One `PARTY_ABBREVIATIONS` entry. */
export const arbPartyAbbreviation: fc.Arbitrary<string> = fc.constantFrom(...PARTY_ABBREVIATIONS);

/** `null` or one Entity_Suffix word, each with probability ½. */
export const arbSuffixWord: fc.Arbitrary<string | null> = fc.oneof(
  fc.constant(null),
  fc.constantFrom(...ENTITY_SUFFIX_WORDS),
);

/** One Party_Name token; `& word` decorations exist only here, not in Word_Runs. */
const arbToken: fc.Arbitrary<string> = fc.oneof(
  { arbitrary: arbPartyWord, weight: 4 },
  {
    arbitrary: fc.tuple(arbCapitalisedWord, arbCapitalisedWord).map(([a, b]) => `${a} & ${b}`),
    weight: 1,
  },
  { arbitrary: arbInitial, weight: 1 },
  { arbitrary: arbPartyAbbreviation, weight: 2 },
);

type PartyToken = Readonly<{ text: string; comma: boolean }>;

/** The raw draws for one Party_Name, rendered by `buildPartyName`. */
type PartyParts = Readonly<{
  tokens: readonly PartyToken[];
  digits: readonly [number, string] | null;
  suffix: string | null;
}>;

const arbPartyParts: fc.Arbitrary<PartyParts> = fc.record({
  tokens: fc.array(fc.record({ text: arbToken, comma: fc.boolean() }), {
    minLength: 1,
    maxLength: 6,
  }),
  digits: fc.oneof(
    { arbitrary: fc.constant(null), weight: 3 },
    fc.tuple(fc.nat(5), fc.integer({ min: 0, max: 99999 }).map(String)),
  ),
  suffix: arbSuffixWord,
});

/** The first `k` tokens joined by single spaces; the last carries no comma. */
function renderTokens(tokens: readonly PartyToken[], k: number): string {
  return tokens
    .slice(0, k)
    .map((t, i) => (t.comma && i < k - 1 ? `${t.text},` : t.text))
    .join(" ");
}

/** Places the digit run, then replaces a leading Signal token by `Smith`. */
function finalTokens(parts: PartyParts, allowDigits: boolean): readonly PartyToken[] {
  const tokens = [...parts.tokens];
  if (allowDigits && parts.digits !== null) {
    const i = parts.digits[0] % tokens.length;
    const t = tokens[i];
    if (t !== undefined) tokens[i] = { text: parts.digits[1], comma: t.comma };
  }
  const first = tokens[0];
  if (first !== undefined && startsWithSignal(first.text, 0, first.text.length)) {
    tokens[0] = { text: "Smith", comma: first.comma };
  }
  return tokens;
}

/** Renders a Party_Name of at most `MAX_PARTY` code units. */
function buildPartyName(parts: PartyParts, allowDigits: boolean): string {
  const tokens = finalTokens(parts, allowDigits);
  const body = renderTokens(tokens, tokens.length);
  const full = parts.suffix === null ? body : `${body}, ${parts.suffix}`;
  if (full.length <= MAX_PARTY) return full;
  if (body.length <= MAX_PARTY) return body;
  let k = tokens.length;
  while (k > 1 && renderTokens(tokens, k).length > MAX_PARTY) k--;
  return renderTokens(tokens, k);
}

/** A Party_Name, valid by construction (Glossary Party_Name). */
export const arbPartyName: fc.Arbitrary<string> = arbPartyParts.map((p) => buildPartyName(p, true));

/** A Case_Name `<Party_Name> v. <Party_Name>,` with at most one digit run in all. */
export const arbCaseName: fc.Arbitrary<string> = fc
  .tuple(arbPartyParts, arbPartyParts, fc.boolean())
  .map(
    ([a, b, leftDigits]) =>
      `${buildPartyName(a, leftDigits)} v. ${buildPartyName(b, !leftDigits)},`,
  );

/** One of the fourteen `SIGNALS`. */
export const arbSignal: fc.Arbitrary<string> = fc.constantFrom(...SIGNALS);

/** One of the twenty `GAP_SIGNALS`, capitalised or lowercase-first. */
export const arbGapSignal: fc.Arbitrary<string> = fc.constantFrom(...GAP_SIGNALS);

/** Prepends pad words (cycling) until `name` is at least `target` long. */
function padParty(name: string, pads: readonly string[], target: number): string {
  let text = name;
  for (let i = 0; text.length < target; i++) {
    text = `${pads[i % pads.length] ?? "Smith"} ${text}`;
  }
  return text;
}

/**
 * A Party_Name-shaped string of 81 to 120 code units: `arbPartyName` with
 * capitalised words (never a live stop-list entry, so never a Signal)
 * prepended. Every space-separated word is at most 22 code units.
 */
export const arbLongParty: fc.Arbitrary<string> = fc
  .tuple(
    arbPartyName,
    fc.array(arbCapitalisedWord.map(notLiveStop), { minLength: 1, maxLength: 8 }),
    fc.integer({ min: MAX_PARTY + 1, max: 107 }),
  )
  .map(([name, pads, target]) => padParty(name, pads, target));
