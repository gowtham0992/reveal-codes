/**
 * Short_Form_Party arbitraries (design "Arbitraries" table; Glossary
 * Short_Form_Party, Word_Run, Connector, Party_Side, Party_Stop_List; D12 to
 * D17; Req 22.1, 22.4).
 *
 * - `arbShortFormParty`: one Party_Side, or two joined by ` v. `. Each side
 *   is a Word_Run of 1 to 6 Capitalised_Words with an optional Connector
 *   between any two, then with probability ½ one Entity_Suffix. Word_Runs are
 *   truncated at a word boundary to 44 code units (one side) or 16 per side
 *   (two sides), so the party is at most 52 code units. A leading live
 *   stop-list word becomes `Smith`; `Id.` and `v.` never occur as words.
 * - `arbStopListPrefix`: 0 to 2 live stop-list entries, each optionally
 *   followed by one Connector, at most 28 code units in all.
 * - `arbPartyLeftContext`: text that ends any Party_Run before what follows.
 */
import fc from "fast-check";
import { CONNECTORS, isCapitalisedWord } from "../citations/party.js";
import {
  arbInitial,
  arbPartyWord,
  arbSuffixWord,
  LIVE_STOP_ENTRIES,
  notLiveStop,
  PARTY_ABBREVIATIONS,
} from "./arb-case-name.js";

/** Single-word party abbreviations that are Capitalised_Words (drops `et al.`). */
const RUN_ABBREVIATIONS: readonly string[] = PARTY_ABBREVIATIONS.filter(
  (a) => !a.includes(" ") && isCapitalisedWord(a, 0, a.length),
);

/** Word_Run limit in a one-side party. */
export const ONE_SIDE_RUN = 44;

/** Word_Run limit per side in a two-side party. */
export const TWO_SIDE_RUN = 16;

/** Longest `arbStopListPrefix` value. */
export const MAX_STOP_PREFIX = 28;

const CONNECTOR_TEXTS: readonly string[] = CONNECTORS.map((c) => c.join(" "));

/** `null` or one Connector, each with probability ½. */
const arbConnector: fc.Arbitrary<string | null> = fc.oneof(
  fc.constant(null),
  fc.constantFrom(...CONNECTOR_TEXTS),
);

/** One Capitalised_Word: abbreviations exclude lower-case `et al.`. */
const arbRunWord: fc.Arbitrary<string> = fc.oneof(
  { arbitrary: arbPartyWord, weight: 4 },
  { arbitrary: arbInitial, weight: 1 },
  { arbitrary: fc.constantFrom(...RUN_ABBREVIATIONS), weight: 1 },
);

type Side = Readonly<{
  first: string;
  rest: readonly (readonly [string | null, string])[];
  suffix: string | null;
}>;

const arbSide: fc.Arbitrary<Side> = fc.record({
  first: arbRunWord,
  rest: fc.array(fc.tuple(arbConnector, arbRunWord), { maxLength: 5 }),
  suffix: arbSuffixWord,
});

/** `w`, or its leading `[A-Z][a-z]*` stem (at most 12) when `w` exceeds `limit`. */
function fitWord(w: string, limit: number): string {
  if (w.length <= limit) return w;
  return /^[A-Z][a-z]*/.exec(w)?.[0] ?? "Smith";
}

/** Renders one Party_Side, truncating its Word_Run to `limit` code units. */
function renderSide(side: Side, limit: number, leading: boolean): string {
  const fitted = fitWord(side.first, limit);
  let run = leading ? notLiveStop(fitted) : fitted;
  for (const [connector, word] of side.rest) {
    const piece = connector === null ? word : `${connector} ${word}`;
    if (run.length + 1 + piece.length > limit) break;
    run = `${run} ${piece}`;
  }
  return side.suffix === null ? run : `${run}, ${side.suffix}`;
}

/** A Short_Form_Party that `partyStartFor` takes whole (design P49). */
export const arbShortFormParty: fc.Arbitrary<string> = fc.oneof(
  arbSide.map((s) => renderSide(s, ONE_SIDE_RUN, true)),
  fc
    .tuple(arbSide, arbSide)
    .map(
      ([a, b]) => `${renderSide(a, TWO_SIDE_RUN, true)} v. ${renderSide(b, TWO_SIDE_RUN, false)}`,
    ),
);

/** One live entry and a space, optionally followed by a Connector and a space. */
const arbStopItem: fc.Arbitrary<string> = fc
  .tuple(fc.constantFrom(...LIVE_STOP_ENTRIES), arbConnector)
  .map(([entry, c]) => (c === null ? `${entry} ` : `${entry} ${c} `));

/** Joins items while the total stays within `MAX_STOP_PREFIX`. */
function joinPrefix(items: readonly string[]): string {
  let text = "";
  for (const item of items) {
    if (text.length + item.length > MAX_STOP_PREFIX) break;
    text += item;
  }
  return text;
}

/** A prefix that Short_Form_Party stripping removes exactly (D12, D13). */
export const arbStopListPrefix: fc.Arbitrary<string> = fc
  .array(arbStopItem, { maxLength: 2 })
  .map(joinPrefix);

/** Lower-case prose words that are not Connectors, `with`, or Gap_Signals. */
const LEFT_PROSE: readonly string[] = ["held", "found", "noted", "argued", "because", "court"];

/** Left contexts that end a Party_Run, including the inert stop-list entries (D15). */
export const arbPartyLeftContext: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom("", "(", "; "),
  fc.constantFrom(...LEFT_PROSE).map((w) => `${w} `),
  fc.constantFrom("Cf. ", "E.g. ", "E.g., ", "See, e.g., ", "See also ", "But see "),
);
