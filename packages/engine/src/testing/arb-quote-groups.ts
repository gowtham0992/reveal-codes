/**
 * Arbitraries for the quote groups of `arbTextWithCitations` (design
 * "Arbitraries" table; Req 13.1, 13.5, 13.7–13.9; D18, D19; Req 22.1,
 * 22.4). Shapes and rendering live in `arb-quote-render.ts`.
 *
 * Citing pieces are a formatted `arbCitation`, `Id.` or `Id. at <n>`, or a
 * party Short_Form from `arbShortFormParty` with no stop-list prefix (in a
 * group the party follows a quotation mark, a Gap_Signal, `In `, or the
 * lead prose word, so its Party_Run cannot extend further left).
 */
import fc from "fast-check";
import { PINCITE_RANGE } from "../citations/lex.js";
import { GAP_SIGNALS } from "../citations/signals.js";
import { arbCaseName, arbGapSignal, arbLongParty, arbPartyName } from "./arb-case-name.js";
import { arbCitation, arbMember } from "./arb-citation.js";
import { arbProseWord, arbQuoteBody } from "./arb-quote-parts.js";
import type { QuoteGroup, QuoteSpec, WrappedGroup } from "./arb-quote-render.js";
import { arbShortFormParty } from "./arb-short-form-party.js";
import {
  canonical,
  type Cite,
  type FullCite,
  type IdCite,
  type PartyCite,
} from "./arb-text-builder.js";

const arbPincite = fc.integer({ min: PINCITE_RANGE.min, max: PINCITE_RANGE.max });

/** A Full_Citation value with its Canonical_Form. */
export const arbFullCite: fc.Arbitrary<FullCite> = arbCitation
  .filter((v) => canonical(v) !== "")
  .map((value): FullCite => ({ kind: "full", value, text: canonical(value) }));

/** `Id.` or `Id. at <n>`. */
export const arbIdCite: fc.Arbitrary<IdCite> = fc
  .option(arbPincite)
  .map((pincite): IdCite => ({ kind: "id", pincite }));

/** A party Short_Form; its pair is resolved against earlier citations when written. */
export const arbPartyCite: fc.Arbitrary<PartyCite> = fc
  .record({
    party: arbShortFormParty,
    pick: fc.option(fc.nat()),
    fallback: arbMember.map((m) => ({ volume: m.volume, reporter: m.reporter })),
    pincite: arbPincite,
  })
  .map((r): PartyCite => ({ kind: "party", ...r }));

/** Any citing piece. */
export const arbCite: fc.Arbitrary<Cite> = fc.oneof(
  { arbitrary: arbFullCite, weight: 3 },
  { arbitrary: arbIdCite, weight: 1 },
  { arbitrary: arbPartyCite, weight: 2 },
);

const arbQuoteSpec: fc.Arbitrary<QuoteSpec> = fc
  .tuple(arbQuoteBody, fc.boolean())
  .map(([q, curly]) => ({ ...q, curly }));

const LOWER_GAP_SIGNALS: readonly string[] = GAP_SIGNALS.filter((s) => /^[a-z]/.test(s));

/** Capitalised words that begin with a Gap_Signal's letters (`Seeds`, `Accordion`). */
const SIGNAL_PREFIX = /^(See|Accord|Compare|Citing|Quoting)/;

/**
 * `arbLongParty` with a first word that no Gap_Signal is a prefix of, kept at
 * the same length (`Seeds` becomes `Xeeds`). Otherwise `S = See` could split
 * the word and leave a Case_Name of at most 80 code units (`ds …`).
 */
export const arbLongPartyNoSignal: fc.Arbitrary<string> = arbLongParty.map((p) =>
  SIGNAL_PREFIX.test(p) ? `X${p.slice(1)}` : p,
);

type Body = fc.Arbitrary<QuoteGroup>;

const g = <T extends Record<string, unknown>>(
  tag: QuoteGroup["tag"],
  parts: { [K in keyof T]: fc.Arbitrary<T[K]> },
): Body =>
  fc.record({ q: arbQuoteSpec, ...parts }).map((r) => ({ tag, ...r }) as unknown as QuoteGroup);

const arbGapCite: fc.Arbitrary<FullCite | PartyCite> = fc.oneof(arbFullCite, arbPartyCite);

/** The groups whose pair should attach, unless its gap has two boundaries. */
const ATTACHING: readonly Body[] = [
  g("same", { c: arbCite }),
  g("next", { c: arbCite, spaced: fc.boolean() }),
  g("caseName", { name: arbCaseName, f: arbFullCite }),
  g("gapSignal", { signal: arbGapSignal, c: arbGapCite }),
  g("gapSignalCase", { signal: arbGapSignal, name: arbCaseName, f: arbFullCite }),
  g("paren", { signal: fc.constantFrom(...LOWER_GAP_SIGNALS), name: arbCaseName, f: arbFullCite }),
  g("followParen", { c: arbCite }),
  g("followColon", { c: arbCite }),
  g("both", { c1: arbCite, c2: arbCite }),
  g("several", { q2: arbQuoteSpec, c: arbCite }),
];

/** The groups whose pair attaches to nothing (Req 13.9). */
const UNATTACHED: readonly Body[] = [
  g("twoBoundaries", { word: arbProseWord, c: arbCite }),
  g("in", { party: arbPartyCite }),
  g("with", { name: arbCaseName, f: arbFullCite }),
  g("twoSignals", {
    signal: arbGapSignal,
    signal2: arbGapSignal,
    name: arbCaseName,
    f: arbFullCite,
  }),
  g("longParty", { long: arbLongPartyNoSignal, other: arbPartyName, f: arbFullCite }),
  g("followSignal", { signal: arbGapSignal, c: arbCite }),
  g("lonely", {}),
];

/** Gap_Signal groups get extra weight so every entry occurs in both cases. */
const WEIGHTED: readonly fc.WeightedArbitrary<QuoteGroup>[] = [...ATTACHING, ...UNATTACHED].map(
  (arbitrary, i) => ({ arbitrary, weight: i === 3 || i === 4 ? 3 : 1 }),
);

/** One quote group between two prose words. */
export const arbWrappedGroup: fc.Arbitrary<WrappedGroup> = fc.record({
  lead: arbProseWord,
  trail: arbProseWord,
  group: fc.oneof(...WEIGHTED),
});
