/**
 * Coverage helpers for Property 18 (task 5.22): what the checked values of
 * `arbTextWithCitations` held, and the fixed sample run as `examples`.
 * Kept here so extract.properties.test.ts stays under the 300-line module
 * limit.
 */
import fc from "fast-check";
import { expect } from "vitest";
import { ENTITY_SUFFIX_WORDS } from "../../src/abbreviations";
import { GAP_SIGNALS } from "../../src/citations/signals";
import { arbTextWithCitations, type TextWithCitations } from "../../src/testing/arbitraries";

/** What the checked values held, keyed by feature (`party:v:suffix`, `tag:signal:attached`). */
export type Coverage = Set<string>;

const SUFFIXES: ReadonlySet<string> = new Set(ENTITY_SUFFIX_WORDS);

/** True when some Party_Side of `party` ends in `, <Entity_Suffix>`. */
function hasSuffix(party: string): boolean {
  return party.split(" v. ").some((side) => {
    const m = /, (\S+)$/.exec(side);
    return m !== null && SUFFIXES.has(m[1] ?? "");
  });
}

/** Records the party Short_Forms and quote groups of one checked value. */
export function record(seen: Coverage, v: TextWithCitations): void {
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
export function expectCovered(seen: Coverage): void {
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
export const COVERAGE_EXAMPLES: [TextWithCitations][] = fc
  .sample(arbTextWithCitations, { numRuns: 400, seed: 518 })
  .map((v): [TextWithCitations] => [v]);
