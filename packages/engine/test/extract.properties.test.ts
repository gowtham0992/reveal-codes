import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ENTITY_SUFFIX_WORDS } from "../src/abbreviations";
import { countBoundaries } from "../src/boundary";
import { extract } from "../src/citations/extract";
import { GAP_SIGNALS } from "../src/citations/signals";
import {
  arbAnyString,
  arbBoundaryText,
  arbCitation,
  arbIdCite,
  arbLetterOrDigit,
  arbNearMissCitation,
  arbOpinionWithQuotes,
  arbOtherReference,
  arbOffsetPair,
  arbPartyCite,
  arbText,
  arbTextWithCitations,
  canonical,
  type TextWithCitations,
} from "../src/testing/arbitraries";
import type { ExtractedCitation, ExtractedQuote } from "../src/types";
import { runs } from "./support/fc";
import { modelQuotes } from "./support/quote-model";
import { arbNoisyText, shifted } from "./support/quote-noise";
import { sentenceIndex, sentencesOf } from "./support/sentence-index";

type Ranged = Readonly<{ start: number; end: number; text: string }>;

/** Every item is the exact slice it claims, and items are sorted and pairwise disjoint. */
function expectExactSortedDisjoint(text: string, items: readonly Ranged[]): void {
  items.forEach((item, i) => {
    expect(text.slice(item.start, item.end)).toBe(item.text);
    const prev = items[i - 1];
    if (prev !== undefined) expect(prev.end).toBeLessThanOrEqual(item.start);
  });
}

/** The marks around `[start, end)` are one straight pair or one curly pair. */
function marksAround(text: string, q: ExtractedQuote): string {
  return (text[q.start - 1] ?? "") + (text[q.end] ?? "");
}

/** One quote: content, marks, a unique non-Other target, and the side it sits on. */
function expectQuoteWellFormed(
  text: string,
  citations: readonly ExtractedCitation[],
  q: ExtractedQuote,
): void {
  expect(q.text).toMatch(/\S/);
  expect(['""', "“”"]).toContain(marksAround(text, q));
  const targets = citations.filter((c) => c.start === q.citationStart);
  expect(targets).toHaveLength(1);
  const target = targets[0];
  if (target === undefined) return;
  expect(target.value.kind).not.toBe("other");
  if (q.rule === "preceding") expect(q.end).toBeLessThan(target.start);
  else expect(q.start - 1).toBeGreaterThanOrEqual(target.end);
}

/** Any string, a constructed citing text, or an opinion body with quotations. */
const arbExtractInput: fc.Arbitrary<string> = fc.oneof(
  arbAnyString,
  arbTextWithCitations.map((t) => t.text),
  arbOpinionWithQuotes.map((o) => o.text),
);

describe("extract offsets _Requirements: 9.2, 9.7, 9.9, 13.2, 13.7_", () => {
  // Property 17
  it("Property 17: extraction offsets are exact on any string", () => {
    fc.assert(
      fc.property(arbExtractInput, (text) => {
        const { citations, quotes } = extract(text);
        expectExactSortedDisjoint(text, citations);
        expectExactSortedDisjoint(text, quotes);
        for (const q of quotes) expectQuoteWellFormed(text, citations, q);
      }),
      runs(),
    );
  });
});

/** What the checked values held, keyed by feature (`party:v:suffix`, `tag:signal:attached`). */
type Coverage = Set<string>;

const SUFFIXES: ReadonlySet<string> = new Set(ENTITY_SUFFIX_WORDS);

/** True when some Party_Side of `party` ends in `, <Entity_Suffix>`. */
function hasSuffix(party: string): boolean {
  return party.split(" v. ").some((side) => {
    const m = /, (\S+)$/.exec(side);
    return m !== null && SUFFIXES.has(m[1] ?? "");
  });
}

/** Records the party Short_Forms and quote groups of one checked value. */
function record(seen: Coverage, v: TextWithCitations): void {
  for (const c of v.expected.citations) {
    if (c.value.kind !== "short" || c.value.form !== "party") continue;
    seen.add(`party:${String(c.value.party.includes(" v. "))}:${String(hasSuffix(c.value.party))}`);
  }
  for (const g of v.groups) {
    seen.add(`${g.tag}::${String(g.attached)}`);
    for (const s of g.signals) seen.add(`${g.tag}:${s}:${String(g.attached)}`);
  }
}

/** The coverage task 5.22 requires of the values Property 18 checked. */
function expectCovered(seen: Coverage): void {
  const want = [
    ...["true", "false"].flatMap((v) => ["true", "false"].map((x) => `party:${v}:${x}`)),
    ...GAP_SIGNALS.map((s) => `gapSignal:${s}:1`),
    "paren:quoting:1",
    ...["twoBoundaries", "in", "with", "twoSignals", "longParty"].map((t) => `${t}::0`),
  ];
  expect(want.filter((w) => !seen.has(w))).toEqual([]);
  for (const t of ["twoBoundaries", "in", "with", "twoSignals", "longParty"]) {
    expect(seen.has(`${t}::1`)).toBe(false);
  }
}

/**
 * A fixed sample run as `examples` before the random runs, so the coverage
 * below holds on every run (at 200 random runs alone, `Cf.` attached is
 * missed for about 6% of seeds). fast-check counts examples inside
 * `numRuns`, so the run count is raised by their number to keep `runs()`
 * random runs.
 */
const COVERAGE_EXAMPLES: [TextWithCitations][] = fc
  .sample(arbTextWithCitations, { numRuns: 400, seed: 518 })
  .map((v): [TextWithCitations] => [v]);

describe("extract on constructed text _Requirements: 9.1, 9.3, 9.4, 9.5, 9.6, 12.1, 12.2, 12.3, 12.6, 12.7, 13.1, 13.5, 13.7, 13.8, 13.9_", () => {
  // Property 18
  it("Property 18: extraction finds exactly the constructed citations, links, and quotes", () => {
    const seen: Coverage = new Set();
    fc.assert(
      fc.property(arbTextWithCitations, (v) => {
        expect(extract(v.text)).toEqual(v.expected);
        record(seen, v);
      }),
      { numRuns: runs().numRuns + COVERAGE_EXAMPLES.length, examples: COVERAGE_EXAMPLES },
    );
    expectCovered(seen);
  });
});

/**
 * A candidate citation as written. `left` holds when its first code unit is
 * the first volume (title, year) digit; `digitEnd` is the Offset just past
 * its last page, pincite, or number digit, or null when it ends in no digit.
 */
type Candidate = Readonly<{ s: string; left: boolean; digitEnd: number | null }>;

/** A Canonical_Form; the digits end before the parenthetical, if any. */
const arbFullCandidate: fc.Arbitrary<Candidate> = arbCitation
  .filter((v) => canonical(v) !== "")
  .map((v): Candidate => {
    const s = canonical(v);
    const paren = v.kind !== "database" && (v.court !== undefined || v.year !== undefined);
    return { s, left: true, digitEnd: paren ? s.lastIndexOf(" (") : s.length };
  });

/** A section ending in subdivisions (`1983(a)`) has its digits end at the first `(`. */
const arbOtherCandidate: fc.Arbitrary<Candidate> = arbOtherReference.map(({ text: s }) => {
  const paren = s.indexOf("(");
  return { s, left: /^[0-9]/.test(s), digitEnd: paren === -1 ? s.length : paren };
});

/** `Id. at <n>` and party Short_Forms end in a pincite; their left rules are their own. */
const arbShortCandidate: fc.Arbitrary<Candidate> = fc
  .oneof(
    arbIdCite.map((c) => (c.pincite === null ? null : `Id. at ${String(c.pincite)}`)),
    arbPartyCite.map(
      (c) =>
        `${c.party}, ${String(c.fallback.volume)} ${c.fallback.reporter} at ${String(c.pincite)}`,
    ),
  )
  .filter((s): s is string => s !== null)
  .map((s) => ({ s, left: false, digitEnd: s.length }));

const arbCandidate: fc.Arbitrary<Candidate> = fc.oneof(
  { arbitrary: arbFullCandidate, weight: 4 },
  {
    arbitrary: arbNearMissCitation.map((n) => ({ s: n.text, left: true, digitEnd: n.text.length })),
    weight: 2,
  },
  { arbitrary: arbOtherCandidate, weight: 1 },
  { arbitrary: arbShortCandidate, weight: 1 },
);

/** The glued texts on the right: `s + x`, and `x` just after the last digit when that is earlier. */
function rightGlued(c: Candidate, d: number, x: string): string[] {
  const glued = [c.s + x];
  if (d < c.s.length) glued.push(c.s.slice(0, d) + x + c.s.slice(d));
  return glued;
}

/** Checks one candidate glued to `x` on each side Req 9.8 covers. */
function expectGlueRejected(c: Candidate, x: string): void {
  // The candidate is a citation on its own, so its absence below is due to `x`.
  expect(extract(c.s).citations.map((k) => [k.start, k.end])).toEqual([[0, c.s.length]]);
  if (c.left) {
    const starts = extract(x + c.s).citations.map((k) => k.start);
    expect(starts).not.toContain(x.length);
  }
  const d = c.digitEnd;
  if (d === null) return;
  for (const t of rightGlued(c, d, x)) {
    expect(extract(t).citations.map((k) => k.end)).not.toContain(d);
  }
}

describe("extract word boundaries _Requirements: 9.8_", () => {
  // Property 19
  it("Property 19: citations glued to letters or digits are not extracted", () => {
    fc.assert(fc.property(arbCandidate, arbLetterOrDigit, expectGlueRejected), runs());
  });
});

describe("extract quote reference model _Requirements: 13.1, 13.5, 13.6, 13.7, 13.8, 13.9, 13.10_", () => {
  it("the reference model reads the Req 13.10 and D21 examples as the design does", () => {
    /** `[quoted text, cited text, rule]` for each model quote. */
    const at = (t: string): readonly string[][] =>
      modelQuotes(t, extract(t).citations).map((q) => [
        q.text,
        t.slice(q.citationStart, q.citationStart + 4) + "@" + String(q.citationStart),
        q.rule,
      ]);
    const nested = '"He wrote “no” 410 U.S. 113 today." Roe v. Wade, 410 U.S. 113';
    expect(at(nested)).toEqual([
      [
        "He wrote “no” 410 U.S. 113 today.",
        `410 @${String(nested.lastIndexOf("410"))}`,
        "preceding",
      ],
    ]);
    expect(at('"a “b" 410 U.S. 113 c” 5 U.S. 1')).toEqual([["a “b", "410 @7", "preceding"]]);
    expect(at('Roe, 410 U.S. 113 ("a “b" c”) 5 U.S. 1')).toEqual([["a “b", "410 @5", "following"]]);
    expect(at('"q" See also See A, Inc. v. A & A, 410 U.S. 113')).toEqual([]);
    expect(at('"q" See also Roe v. Wade, 410 U.S. 113')).toEqual([["q", "410 @26", "preceding"]]);
    expect(at('"q," with Casey v. Smith, 5 U.S. 1')).toEqual([]);
    expect(at('"q" In Casey, 505 U.S. at 833')).toEqual([]);
  });

  it("Property 20 counterexample (seed -341920749): no `Id.` right after a closing `”` (Req 12.1)", () => {
    expect(extract("argued later. Id.").citations.map((c) => c.start)).toEqual([14]);
    expect(extract('"argued later. "”Id.').citations).toEqual([]);
    expect(extract('"argued later. "“Id.').citations.map((c) => c.start)).toEqual([17]);
  });

  // Property 20
  it("Property 20: quote pairing and attachment agree with a reference model", () => {
    fc.assert(
      fc.property(arbNoisyText, ({ base, text, shift }) => {
        const got = extract(text);
        expect(got.citations).toEqual(extract(base).citations.map((c) => shifted(c, shift)));
        expect(got.quotes).toEqual(modelQuotes(text, got.citations));
      }),
      runs(),
    );
  });
});

/** Citing text with abbreviations and initials spliced in, or plain prose, with an Offset pair. */
const arbBoundaryPair = fc
  .oneof(
    { arbitrary: arbBoundaryText.map((b) => b.text), weight: 3 },
    { arbitrary: arbText, weight: 1 },
  )
  .chain((t) => arbOffsetPair(t).map((pair) => ({ t, pair })));

describe("extract boundary counting _Requirements: 13.1, 13.8_", () => {
  // Property 44
  it("Property 44: boundary counting agrees with the Segmenter's Sentences", () => {
    fc.assert(
      fc.property(arbBoundaryPair, fc.integer({ min: 1, max: 3 }), ({ t, pair }, cap) => {
        if (pair === null) return;
        const [x, y] = pair;
        const cits = extract(t).citations;
        const sentences = sentencesOf(t);
        const want = sentenceIndex(sentences, y) - sentenceIndex(sentences, x);
        expect(countBoundaries(t, x, y, cits, Infinity)).toBe(want);
        expect(countBoundaries(t, x, y, cits, cap)).toBe(Math.min(want, cap));
      }),
      runs(),
    );
  });
});
