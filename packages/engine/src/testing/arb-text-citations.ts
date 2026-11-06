/**
 * `arbTextWithCitations` and `arbCitingString` (design "Arbitraries" table;
 * Req 9, 11, 12, 13; Req 22.1, 22.4).
 *
 * A value is a list of fragments joined by `" "` or `". "`: prose words,
 * formatted Full_Citations, Near_Misses, `Id.` forms, party Short_Forms,
 * Other_References, and quote groups (`arb-quote-groups.ts`). The expected
 * `Extraction` is recorded by `arb-text-builder.ts` while the text is
 * written, never by calling `extract`.
 *
 * Separation rules, so that no two fragments combine into another match:
 * - two non-prose fragments are never adjacent; the builder writes the prose
 *   word `held` between them, so no citation can take a following `(` as
 *   its parenthetical, an `Id.` is never followed by ` at` or a number, and
 *   no Party_Run reaches back into a citation;
 * - a fragment ending in `.` (`Id.`) is followed by `" "`, never `". "`;
 * - a standalone party Short_Form is preceded by `; `, `(`, a prose word and
 *   a space, or a Gap_Signal and a space, then an `arbStopListPrefix`. A
 *   capitalised live Gap_Signal (`See`, `Accord`, …) is absorbed into the
 *   Party_Run and stripped, so the prefix is dropped when signal, prefix, and
 *   party together would exceed 80 code units;
 * - a LEXIS Database_Citation is joined like any other fragment: no earlier
 *   number can start a longer LEXIS match, because that court would hold the
 *   citation's own year as a token (A9 step 2, D22);
 * - a fragment that would take the text past 5,000 code units ends the value.
 */
import fc from "fast-check";
import { MAX_PARTY } from "../citations/party.js";
import { GAP_SIGNALS } from "../citations/signals.js";
import type { Extraction, OtherValue } from "../types.js";
import { LIVE_STOP_ENTRIES } from "./arb-case-name.js";
import { arbNearMissCitation, arbReporterValue, type NearMiss } from "./arb-citation.js";
import {
  arbCite,
  arbIdCite,
  arbFullCite,
  arbPartyCite,
  arbWrappedGroup,
} from "./arb-quote-groups.js";
import { arbProseWord } from "./arb-quote-parts.js";
import { renderGroup, type GroupRecord, type WrappedGroup } from "./arb-quote-render.js";
import { arbStopListPrefix } from "./arb-short-form-party.js";
import {
  canonical,
  cloneBuilder,
  newBuilder,
  put,
  putCite,
  putFull,
  putOther,
  type Builder,
  type Cite,
  type PartyCite,
} from "./arb-text-builder.js";

/** Upper bound on `arbTextWithCitations` text length. */
export const MAX_TEXT_WITH_CITATIONS = 5000;

const FILLER = "held";

type PartyFragment = Readonly<{ context: string; prefix: string; cite: PartyCite }>;

type Fragment =
  | Readonly<{ kind: "prose"; word: string }>
  | Readonly<{ kind: "cite"; cite: Cite }>
  | Readonly<{ kind: "party"; party: PartyFragment }>
  | Readonly<{ kind: "near"; near: NearMiss }>
  | Readonly<{ kind: "other"; text: string; value: OtherValue }>
  | Readonly<{ kind: "group"; group: WrappedGroup }>;

type Placed = Readonly<{ sep: " " | ". "; fragment: Fragment }>;

/** The text, the Extraction it should yield, and the quote groups it holds. */
export type TextWithCitations = Readonly<{
  text: string;
  expected: Extraction;
  groups: readonly GroupRecord[];
}>;

const arbSection: fc.Arbitrary<string> = fc
  .tuple(fc.integer({ min: 1, max: 9999 }), fc.constantFrom("", "", "(a)", "(b)(6)", "(c)(1)"))
  .map(([n, sub]) => String(n) + sub);

const FED_SETS: readonly string[] = ["Civ. P. ", "Crim. P. ", "App. P. ", "Bankr. P. ", "Evid. "];

/** An Other_Reference as written and its value. */
export type OtherReference = Readonly<{ text: string; value: OtherValue }>;

/** An Other_Reference string and its value (D8). */
export const arbOtherReference: fc.Arbitrary<OtherReference> = fc.oneof(
  fc
    .tuple(fc.integer({ min: 1, max: 999 }), fc.constantFrom("usc", "cfr"), arbSection)
    .map(([title, form, section]): OtherReference => {
      const code = form === "usc" ? "U.S.C." : "C.F.R.";
      const value: OtherValue = { kind: "other", form, title, section };
      return { text: `${String(title)} ${code} § ${section}`, value };
    }),
  fc.tuple(fc.constantFrom(...FED_SETS), arbSection).map(([set, section]): OtherReference => ({
    text: `Fed. R. ${set}${section}`,
    value: { kind: "other", form: "fed_rule", section },
  })),
);

const arbOther: fc.Arbitrary<Fragment> = arbOtherReference.map((r): Fragment => ({
  kind: "other",
  ...r,
}));

const arbPartyContext: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom("; ", "("),
  arbProseWord.map((w) => `${w} `),
  fc.constantFrom(...GAP_SIGNALS).map((s) => `${s} `),
);

const arbPartyFragment: fc.Arbitrary<Fragment> = fc
  .record({ context: arbPartyContext, prefix: arbStopListPrefix, cite: arbPartyCite })
  .map((party): Fragment => ({ kind: "party", party }));

const arbFragment: fc.Arbitrary<Fragment> = fc.oneof(
  { arbitrary: arbProseWord.map((word): Fragment => ({ kind: "prose", word })), weight: 4 },
  { arbitrary: arbFullCite.map((cite): Fragment => ({ kind: "cite", cite })), weight: 3 },
  { arbitrary: arbIdCite.map((cite): Fragment => ({ kind: "cite", cite })), weight: 1 },
  { arbitrary: arbPartyFragment, weight: 2 },
  { arbitrary: arbNearMissCitation.map((near): Fragment => ({ kind: "near", near })), weight: 1 },
  { arbitrary: arbOther, weight: 1 },
  { arbitrary: arbWrappedGroup.map((group): Fragment => ({ kind: "group", group })), weight: 5 },
);

const LIVE: ReadonlySet<string> = new Set(LIVE_STOP_ENTRIES);

/** Writes a standalone party Short_Form with its left context and prefix. */
function putPartyFragment(b: Builder, p: PartyFragment): void {
  const signal = p.context.trimEnd();
  const absorbed = LIVE.has(signal) ? p.context.length : 0;
  const fits = absorbed + p.prefix.length + p.cite.party.length <= MAX_PARTY;
  put(b, p.context + (fits ? p.prefix : ""));
  putCite(b, p.cite);
}

/** Writes one fragment; returns its group record, if it is a quote group. */
function putFragment(b: Builder, f: Fragment): GroupRecord | null {
  switch (f.kind) {
    case "prose":
      put(b, f.word);
      return null;
    case "cite":
      putCite(b, f.cite);
      return null;
    case "party":
      putPartyFragment(b, f.party);
      return null;
    case "near":
      putFull(b, f.near.value, f.near.text, canonical(f.near.value));
      return null;
    case "other":
      putOther(b, f.text, f.value);
      return null;
    case "group":
      return renderGroup(b, f.group);
  }
}

/** Writes the separator before `p`, plus the filler word between two non-prose fragments. */
function putSeparator(b: Builder, p: Placed, prevProse: boolean): void {
  if (b.text.length === 0) return;
  put(b, b.text.endsWith(".") ? " " : p.sep);
  if (!prevProse && p.fragment.kind !== "prose") put(b, `${FILLER} `);
}

/** Joins the fragments, stopping before the first that would pass the length bound. */
function build(placed: readonly Placed[]): TextWithCitations {
  let b = newBuilder();
  const groups: GroupRecord[] = [];
  let prevProse = true;
  for (const p of placed) {
    const saved = cloneBuilder(b);
    putSeparator(b, p, prevProse);
    const record = putFragment(b, p.fragment);
    if (b.text.length > MAX_TEXT_WITH_CITATIONS) {
      b = saved;
      break;
    }
    if (record !== null) groups.push(record);
    prevProse = p.fragment.kind === "prose";
  }
  return { text: b.text, expected: { citations: b.citations, quotes: b.quotes }, groups };
}

/** Text with citations, links, and quotes, and the `Extraction` it must yield (P18). */
export const arbTextWithCitations: fc.Arbitrary<TextWithCitations> = fc
  .array(fc.record({ sep: fc.constantFrom<" " | ". ">(" ", ". "), fragment: arbFragment }), {
    maxLength: 30,
    size: "max",
  })
  .map(build);

/** A citing string and the start of the citation a following quote attaches to. */
export type CitingString = Readonly<{ text: string; citationStart: number }>;

/**
 * A formatted `arbCitation`, `Id.`, `Id. at <n>`, or `<Party>, <vol> <rep>
 * at <n>` preceded by its Full_Citation and `; ` (no boundary between them).
 * `citationStart` is the start of the last citation in `text`.
 */
export const arbCitingString: fc.Arbitrary<CitingString> = fc.oneof(
  arbCite
    .filter((c) => c.kind !== "party")
    .map((c) => {
      const b = newBuilder();
      putCite(b, c);
      return { text: b.text, citationStart: 0 };
    }),
  fc.tuple(arbReporterValue, arbPartyCite).map(([value, party]) => {
    const b = newBuilder();
    putFull(b, value, canonical(value));
    put(b, "; ");
    const citationStart = putCite(b, { ...party, pick: 0 });
    return { text: b.text, citationStart };
  }),
);
