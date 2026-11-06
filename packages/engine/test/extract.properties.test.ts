import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ENTITY_SUFFIX_WORDS } from "../src/abbreviations";
import { extract } from "../src/citations/extract";
import { GAP_SIGNALS } from "../src/citations/signals";
import {
  arbAnyString,
  arbOpinionWithQuotes,
  arbTextWithCitations,
  type TextWithCitations,
} from "../src/testing/arbitraries";
import type { ExtractedCitation, ExtractedQuote } from "../src/types";
import { runs } from "./support/fc";

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
