/**
 * Property 49 helpers (task 5.29; Req 9.2, 12.2, 12.8; Glossary
 * Short_Form_Party, Capitalised_Word, Word_Run, Party_Side, Party_Run,
 * Entity_Suffix, Party_Stop_List; D12 to D18).
 *
 * The Capitalised_Word and Party_Run checkers here are written from the
 * Glossary and share no code with `party.ts` or `party-lex.ts`: the word
 * lists are copied from the Glossary text, and only the vendored
 * `reporters.json` data is read for the reporter Legal_Abbreviations.
 */
import fc from "fast-check";
import { expect } from "vitest";
import reportersJson from "../../src/citations/reporters.json" with { type: "json" };
import { extract } from "../../src/citations/extract";
import {
  arbAnyString,
  arbCitation,
  arbPartyLeftContext,
  arbShortFormParty,
  arbStopListPrefix,
  arbTextWithCitations,
  canonical,
} from "../../src/testing/arbitraries";
import type { ExtractedCitation, FullValue, PartyValue } from "../../src/types";

/** Glossary Legal_Abbreviation: the fixed list plus every Reporter_List entry. */
const LEGAL_ABBREVIATIONS: ReadonlySet<string> = new Set([
  ...["Id.", "v.", "Inc.", "Corp.", "Ltd.", "Co.", "L.P.", "N.A.", "L.L.C."],
  ...["No.", "Cir.", "Dist.", "Ct.", "Fed.", "Supp.", "et al."],
  ...(reportersJson as readonly string[]),
]);

/** Glossary Entity_Suffix words. */
const SUFFIX_WORDS: ReadonlySet<string> = new Set([
  "Inc.",
  "LLC",
  "L.L.C.",
  "Ltd.",
  "Co.",
  "Corp.",
  "L.P.",
  "N.A.",
]);

/** Glossary Signal plus the extra Party_Stop_List entries. */
export const STOP_ENTRIES: readonly string[] = [
  ...["See", "See also", "See, e.g.,", "E.g.,", "Accord", "Cf.", "But see", "Compare"],
  ...["Citing", "Quoting", "But cf.", "Contra", "E.g.", "See generally"],
  ...["In", "As", "Under", "Following", "Applying", "The court in", "The Court in"],
];

const LETTER_RULE = /^\p{Lu}[\p{L}0-9'’-]*$/u;

/** Glossary Capitalised_Word (as amended: an abbreviation must end in `.`). */
export function isCapitalisedWordRef(w: string): boolean {
  if (w.includes(" ")) return false;
  if (LETTER_RULE.test(w)) return true;
  if (/^[A-Z]\.$/.test(w)) return true;
  return w !== "v." && w.endsWith(".") && LEGAL_ABBREVIATIONS.has(w);
}

/** Glossary Word_Run: Capitalised_Words and Connectors, first and last capitalised. */
export function isWordRunRef(run: string): boolean {
  if (run.includes(",")) return false;
  const words = run.split(" ");
  if (words.some((w) => w === "")) return false;
  if (!isCapitalisedWordRef(words[0] ?? "")) return false;
  if (!isCapitalisedWordRef(words[words.length - 1] ?? "")) return false;
  for (let i = 1; i < words.length - 1; i++) {
    const w = words[i] ?? "";
    if (w === "ex" && words[i + 1] === "rel.") {
      i++;
      continue;
    }
    if (!isCapitalisedWordRef(w) && !["&", "of", "the", "and"].includes(w)) return false;
  }
  return true;
}

/** Glossary Party_Side: a Word_Run and at most one Entity_Suffix. */
export function isPartySideRef(side: string): boolean {
  const comma = side.lastIndexOf(", ");
  if (comma < 0) return isWordRunRef(side);
  return SUFFIX_WORDS.has(side.slice(comma + 2)) && isWordRunRef(side.slice(0, comma));
}

/** Glossary Party_Run: one Party_Side, or two joined by one ` v. `. */
export function isPartyRunRef(party: string): boolean {
  if (/["“”]/.test(party) || /[0-9]+ [^ ]+ [0-9]/.test(party)) return false;
  const sides = party.split(" v. ");
  return sides.length <= 2 && sides.every(isPartySideRef);
}

/** The range text's first word, up to the first space or `,`. */
export function firstWord(range: string): string {
  return /^[^ ,]*/.exec(range)?.[0] ?? "";
}

/** Property 49's four clauses for one party Short_Form `k` of `t`. */
export function expectPartyShortForm(t: string, k: ExtractedCitation, v: PartyValue): void {
  const range = t.slice(k.start, k.end);
  const ctx = { t, range, party: v.party };
  expect({ ...ctx, cap: isCapitalisedWordRef(firstWord(range)) }).toEqual({ ...ctx, cap: true });
  const stop = STOP_ENTRIES.filter((e) => range.startsWith(`${e} `));
  expect({ ...ctx, stop }).toEqual({ ...ctx, stop: [] });
  expect(t.slice(k.start, k.start + v.party.length)).toBe(v.party);
  const tail = t.slice(k.start + v.party.length);
  expect({ ...ctx, tail: tail.startsWith(`, ${String(v.volume)} `) }).toEqual({
    ...ctx,
    tail: true,
  });
  expect(v.party.length).toBeGreaterThanOrEqual(1);
  expect(v.party.length).toBeLessThanOrEqual(80);
  expect({ ...ctx, run: isPartyRunRef(v.party) }).toEqual({ ...ctx, run: true });
}

/** Every party Short_Form of `extract(t)` satisfies Property 49; returns them. */
export function expectPartyForms(t: string): readonly PartyValue[] {
  const out: PartyValue[] = [];
  for (const k of extract(t).citations) {
    if (k.value.kind !== "short" || k.value.form !== "party") continue;
    expectPartyShortForm(t, k, k.value);
    out.push(k.value);
  }
  return out;
}

/** The drawn pieces of a built party Short_Form string. */
export type BuiltParty = Readonly<{
  l: string;
  x: string;
  r: string;
  c: FullValue;
  pg: number;
  /** Write `canonical(c) + ". "` first, so the Short_Form can link to it. */
  linked: boolean;
}>;

/** `[volume, reporter]` of `c`'s first reporter, or null for a Database_Citation. */
function volRep(c: FullValue): readonly [number, string] | null {
  if (c.kind === "reporter") return [c.volume, c.reporter];
  if (c.kind === "parallel")
    return c.members[0] ? [c.members[0].volume, c.members[0].reporter] : null;
  return null;
}

/** `(prefix) + l + x + r + ", " + v + " " + rep + " at " + pg`. */
export function builtText(b: BuiltParty): string {
  const [v, rep] = volRep(b.c) ?? [0, ""];
  const prefix = b.linked ? `${canonical(b.c)}. ` : "";
  return `${prefix}${b.l}${b.x}${b.r}, ${String(v)} ${rep} at ${String(b.pg)}`;
}

export const arbBuiltParty: fc.Arbitrary<BuiltParty> = fc.record({
  l: arbPartyLeftContext,
  x: arbStopListPrefix,
  r: arbShortFormParty,
  c: arbCitation.filter((c) => volRep(c) !== null),
  pg: fc.integer({ min: 1, max: 9999 }),
  linked: fc.boolean(),
});

/** One Property 49 input, tagged by source. */
export type P49Input =
  | Readonly<{ src: "twc"; t: string }>
  | Readonly<{ src: "any"; t: string }>
  | Readonly<{ src: "built"; t: string; b: BuiltParty }>;

export const arbP49Input: fc.Arbitrary<P49Input> = fc.oneof(
  arbTextWithCitations.map((v): P49Input => ({ src: "twc", t: v.text })),
  arbAnyString.map((t): P49Input => ({ src: "any", t })),
  {
    arbitrary: arbBuiltParty.map((b): P49Input => ({ src: "built", t: builtText(b), b })),
    weight: 2,
  },
);
