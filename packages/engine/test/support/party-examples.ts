/**
 * Short_Form_Party named examples (task 5.31; Req 9.2, 12.2, 12.8, 13.1; D12–D18).
 *
 * Each example is `full + ". " + lead + party + tail`, where `full` is a
 * Full_Citation the party Short_Form can link to. The expected result is the
 * whole `extract` output: the Full_Citation at 0, then the party Short_Form
 * starting after `lead` and ending at the end of `tail`, linked to 0. When
 * `party` is null, `lead` holds the whole run and no Short_Form is expected.
 */
import { expect } from "vitest";
import { extract } from "../../src/citations/extract";
import type { ExtractedCitation, ExtractedQuote, ReporterValue } from "../../src/types";

type Full = Readonly<{ text: string; value: ReporterValue }>;

const full = (volume: number, page: number, year: number): Full => ({
  text: `${String(volume)} U.S. ${String(page)} (${String(year)})`,
  value: { kind: "reporter", volume, reporter: "U.S.", page, year },
});

const F5 = full(5, 1, 1801);
const ROE = full(410, 113, 1973);
const CASEY = full(505, 833, 1992);

/** One named example. `quote` is a preceding quote `"q"` placed before `lead`. */
export type PartyExample = Readonly<{
  name: string;
  full: Full;
  lead: string;
  party: string | null;
  pincite: number;
  quote?: "attaches" | "none";
}>;

const ex = (name: string, lead: string, party: string | null, more?: Partial<PartyExample>) => ({
  name,
  full: F5,
  lead,
  party,
  pincite: 9,
  ...more,
});

const P76 = `${"Abcdefghi ".repeat(7)}Abcdef`;
const R81 = `${"Abcdefghi ".repeat(8)}A`;
const V81 = `${"Abcdefghi ".repeat(6)}Abcdefghi, Inc. v. Ab`;
const WORD90 = `A${"b".repeat(89)}`;
const roe = { full: ROE, pincite: 153 };
const casey = { full: CASEY, pincite: 833 };

export const PARTY_EXAMPLES: readonly PartyExample[] = [
  ex("`In Casey` gives `Casey`", "In ", "Casey"),
  ex("`Planned Parenthood`", "", "Planned Parenthood"),
  ex("`See Planned Parenthood`", "See ", "Planned Parenthood"),
  ex("`In the Matter of Smith` gives `Matter of Smith`", "In the ", "Matter of Smith"),
  ex("`The Smith Corp.` keeps `The`", "", "The Smith Corp."),
  ex("`Smith, Inc.` starts at `S` (D14 reversed)", "", "Smith, Inc."),
  ex("`foo, Inc.` gives `Inc.`", "foo, ", "Inc."),
  ex("`Roe v. Wade` starts at `R`", "", "Roe v. Wade", roe),
  ex("`See Roe v. Wade` gives the same party", "See ", "Roe v. Wade", roe),
  ex("`Acme, Inc. v. Smith`", "", "Acme, Inc. v. Smith"),
  ex("`Acme, Inc. v. Smith, LLC`", "", "Acme, Inc. v. Smith, LLC"),
  ex("`A v. B v. C` gives `B v. C`", "A v. ", "B v. C"),
  ex("`foo v. Wade` gives `Wade`", "foo v. ", "Wade"),
  ex("`In v. Wade` gives no party Short_Form", "In v. Wade", null),
  ex("`Id. Smith` is one party, no `Id.` (D16)", "", "Id. Smith"),
  ex("`Cf. Casey` gives `Casey` (D15)", "Cf. ", "Casey"),
  ex("`E.g., Casey` gives `Casey` (D15)", "E.g., ", "Casey"),
  ex("`United States ex rel. Smith`", "", "United States ex rel. Smith"),
  ex("`Smith&Jones` gives `Jones`", "Smith&", "Jones"),
  ex("an 81-code-unit Party_Run gives no Short_Form", `held ${R81}`, null),
  ex("81 code units through ` v. ` and an Entity_Suffix", `held ${V81}`, null),
  ex("a 76-code-unit party after ` extensively `", "held extensively ", P76),
  ex("a 76-code-unit party after a 90-code-unit word (D17)", `${WORD90} `, P76),
  ex("quote before `Planned Parenthood`", "", "Planned Parenthood", {
    ...casey,
    quote: "attaches",
  }),
  ex("quote before `See Planned Parenthood`", "See ", "Planned Parenthood", {
    ...casey,
    quote: "attaches",
  }),
  ex("quote before `In Casey` attaches to nothing", "In ", "Casey", { ...casey, quote: "none" }),
];

/** The example's text and the exact `extract` output it must give. */
export function partyExample(e: PartyExample): {
  t: string;
  citations: ExtractedCitation[];
  quotes: ExtractedQuote[];
} {
  const v = e.full.value;
  const tail = `, ${String(v.volume)} ${v.reporter} at ${String(e.pincite)}`;
  const q = e.quote === undefined ? "" : '"q" ';
  const before = `${e.full.text}. ${q}${e.lead}`;
  const t = before + (e.party ?? "") + tail;
  const citations: ExtractedCitation[] = [
    { start: 0, end: e.full.text.length, text: e.full.text, value: v },
  ];
  if (e.party !== null) {
    const value = { kind: "short", form: "party", party: e.party, volume: v.volume } as const;
    const rest = { reporter: v.reporter, pincite: e.pincite, targetStart: 0 };
    citations.push({
      start: before.length,
      end: t.length,
      text: t.slice(before.length),
      value: { ...value, ...rest },
    });
  }
  const qs = e.full.text.length + 3;
  const quotes: ExtractedQuote[] =
    e.quote === "attaches"
      ? [{ start: qs, end: qs + 1, text: "q", citationStart: before.length, rule: "preceding" }]
      : [];
  return { t, citations, quotes };
}

/** Asserts the exact party, start Offset, range end, `targetStart`, and quotes. */
export function expectPartyExample(e: PartyExample): void {
  const { t, citations, quotes } = partyExample(e);
  if (e.party !== null) expect(t[citations[1]?.start ?? -1]).toBe(e.party[0]);
  expect({ t, ...extract(t) }).toEqual({ t, citations, quotes });
}
