import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { extract } from "../src/citations/extract";
import {
  arbInReName,
  arbLeadIn,
  arbNameBoundary,
  arbTolerantCaseName,
  POOL_A_M,
  POOL_N_Z,
} from "../src/testing/arbitraries";
import { runs } from "./support/fc";

const FULL_CITATIONS = [
  "410 U.S. 113, 116 (1973)",
  "598 F.3d 1, 7 (2d Cir. 2010)",
  "2024 WL 123456",
  "410 U.S. 113, 93 S. Ct. 705 (1973)",
  "2023 U.S. Dist. LEXIS 98765",
] as const;

type Scenario = Readonly<{
  name: string;
  leadIn: string;
  boundary: string;
  gap: string;
  citation: (typeof FULL_CITATIONS)[number];
  stringCite: boolean;
}>;

const arbName: fc.Arbitrary<{ name: string; leadInAllowed: boolean }> = fc.oneof(
  fc
    .constantFrom(POOL_A_M, POOL_N_Z)
    .chain((pool) => arbTolerantCaseName(pool).map((name) => ({ name, leadInAllowed: true }))),
  arbInReName.map((name) => ({ name, leadInAllowed: false })),
);

const arbScenario: fc.Arbitrary<Scenario> = fc
  .tuple(
    arbName,
    arbLeadIn,
    arbNameBoundary,
    fc.constantFrom(" ", "  ", "\n", " \n "),
    fc.constantFrom(...FULL_CITATIONS),
    fc.boolean(),
  )
  .map(([n, leadIn, boundary, gap, citation, stringCite]) => ({
    name: n.name,
    leadIn: n.leadInAllowed ? leadIn : "",
    boundary,
    gap,
    citation,
    stringCite,
  }));

/** The text before the name: boundary, optional string-cite prefix, lead-in. */
function prefixOf(s: Scenario): string {
  const lead = s.leadIn === "" ? "" : `${s.leadIn} `;
  return s.stringCite ? `${s.boundary}410 U.S. 113 (1973); ${lead}` : `${s.boundary}${lead}`;
}

type Nameless = Readonly<{
  boundary: string;
  lead: string;
  citation: (typeof FULL_CITATIONS)[number];
  short: string;
}>;

const arbNameless: fc.Arbitrary<Nameless> = fc.record({
  boundary: arbNameBoundary,
  lead: fc.constantFrom("", "the holding is in ", "see "),
  citation: fc.constantFrom(...FULL_CITATIONS),
  short: fc.constantFrom("Id.", "Id. at 118", "Roe, 410 U.S. at 116"),
});

// Property 3
describe("case-match cited name _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.13, 1.14, 1.15_", () => {
  it("reads back the name as written, and leaves it absent where no name or a Short_Form applies", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          arbScenario.map((s) => ({ s }) as const),
          arbNameless.map((n) => ({ n }) as const),
        ),
        (input) => {
          if ("s" in input) {
            const s = input.s;
            const text = `${prefixOf(s)}${s.name},${s.gap}${s.citation}`;
            const start = text.length - s.citation.length;
            const hit = extract(text).citations.find((c) => c.start === start);
            expect(hit).toBeDefined();
            expect(hit?.caseName).toBe(s.name);
            expect((hit?.caseName ?? "").length).toBeLessThanOrEqual(164);
            return;
          }
          const n = input.n;
          const found = extract(`${n.boundary}${n.lead}${n.citation}. ${n.short}`).citations;
          expect(found.length).toBeGreaterThanOrEqual(2);
          for (const c of found) {
            expect(Object.prototype.hasOwnProperty.call(c, "caseName")).toBe(false);
          }
        },
      ),
      runs(),
    );
  });
});
