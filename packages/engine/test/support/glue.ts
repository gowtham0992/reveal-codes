/**
 * Candidate builders for Property 19 (citations glued to letters or digits
 * are not extracted; Req 9.8). Kept here so extract.properties.test.ts stays
 * under the 300-line module limit.
 */
import fc from "fast-check";
import { expect } from "vitest";
import { extract } from "../../src/citations/extract";
import {
  arbCitation,
  arbIdCite,
  arbNearMissCitation,
  arbOtherReference,
  arbPartyCite,
  canonical,
} from "../../src/testing/arbitraries";

/**
 * A candidate citation as written. `left` holds when its first code unit is
 * the first volume (title, year) digit; `digitEnd` is the Offset just past
 * its last page, pincite, or number digit, or null when it ends in no digit.
 */
export type Candidate = Readonly<{ s: string; left: boolean; digitEnd: number | null }>;

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

export const arbCandidate: fc.Arbitrary<Candidate> = fc.oneof(
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
export function expectGlueRejected(c: Candidate, x: string): void {
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
