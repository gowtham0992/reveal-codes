/**
 * Helpers for Property 19 (Requirement 18.15): a citation written with a
 * Pincite_Expression, and the same citation written with the First_Page alone.
 */
import fc from "fast-check";
import { expect } from "vitest";
import { extract } from "../../src/citations/extract";
import { arbFullCiteWith, arbIdCiteWith, arbPartyCiteWith } from "../../src/testing/arb-cite-style";
import { canonical, newBuilder, put, putCite, type Cite } from "../../src/testing/arb-text-builder";

/** A Full_Citation, `Id.` or party Short_Form written with a Pincite_Expression. */
export const arbExpressionCite: fc.Arbitrary<Cite> = fc.oneof(
  arbFullCiteWith("expression"),
  arbIdCiteWith("expression"),
  arbPartyCiteWith("expression"),
);

/** Text that follows the citation and cannot extend it. */
export const arbAfter: fc.Arbitrary<string> = fc.constantFrom(
  "",
  ". The court held.",
  " held",
  "; see also the order.",
);

/** The same citation with the First_Page alone in place of the expression. */
export function twinOf(c: Cite): Cite {
  switch (c.kind) {
    case "full":
      return { kind: "full", value: c.value, text: canonical(c.value) };
    case "id":
      return { kind: "id", pincite: c.pincite };
    case "party":
      return {
        kind: "party",
        party: c.party,
        pick: c.pick,
        fallback: c.fallback,
        pincite: c.pincite,
      };
  }
}

/** Writes `See <cite><after>` and returns the text and where the citation starts. */
function write(c: Cite, after: string): Readonly<{ text: string; start: number }> {
  const b = newBuilder();
  put(b, "See ");
  const start = putCite(b, c);
  put(b, after);
  return { text: b.text, start };
}

/** The written citation text, as `putCite` writes it. */
function writtenText(c: Cite): string {
  const b = newBuilder();
  putCite(b, c);
  return b.text;
}

/** True when the cite is written with more than one page. */
export function hasExpression(c: Cite): boolean {
  if (c.kind === "id" || c.kind === "party") {
    return c.pinciteText !== undefined && /\D/.test(c.pinciteText);
  }
  return c.text !== canonical(c.value);
}

/** Property 19's relation for one citation; returns 1 when the pincite was a range or list. */
export function checkPincite(c: Cite, after: string): number {
  const written = write(c, after);
  const twin = write(twinOf(c), after);
  const got = extract(written.text).citations;
  const base = extract(twin.text).citations;
  expect(got.length).toBe(base.length);
  const at = got.find((x) => x.start === written.start);
  const baseAt = base.find((x) => x.start === twin.start);
  expect(at).toBeDefined();
  expect(baseAt).toBeDefined();
  expect(at?.text).toBe(writtenText(c));
  expect(at?.end).toBe(written.start + writtenText(c).length);
  expect(at?.value).toEqual(baseAt?.value);
  return hasExpression(c) ? 1 : 0;
}
