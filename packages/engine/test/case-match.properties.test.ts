import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { extract } from "../src/citations/extract";
import { apply, createDocument } from "../src/document";
import type { CitationRecord, Document } from "../src/types";
import {
  arbCitationTargetedOp,
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

type FullRecord = Extract<CitationRecord, { kind: "full" }>;

function fullRecords(doc: Document): readonly FullRecord[] {
  return doc.citations.filter((r): r is FullRecord => r.kind === "full");
}

const TIMESTAMP = "2024-01-01T00:00:00.000Z";

/** A starting Document whose text holds one to three named Full_Citations. */
const arbNamedDocument: fc.Arbitrary<Document> = fc
  .array(arbScenario, { minLength: 1, maxLength: 3 })
  .map((scenarios) =>
    scenarios.map((s) => `${prefixOf(s)}${s.name},${s.gap}${s.citation}`).join("\n\n"),
  )
  .map((text) => {
    const created = createDocument(text, TIMESTAMP);
    if (!created.ok) throw new Error("arbNamedDocument: createDocument rejected generated text");
    return created.value;
  });

/** Up to `n` citation-targeted edits, each drawn against the Document the previous ones produced. */
function arbEditedStates(doc: Document, n: number): fc.Arbitrary<readonly Document[]> {
  if (n === 0) return fc.constant([]);
  return arbCitationTargetedOp(doc).chain((op) => {
    const applied = apply(doc, op);
    if (!applied.ok)
      throw new Error(`arbEditedStates: apply rejected a generated op: ${applied.error.kind}`);
    const next = applied.value.document;
    return arbEditedStates(next, n - 1).map((rest) => [next, ...rest]);
  });
}

const arbHistory: fc.Arbitrary<readonly Document[]> = arbNamedDocument.chain((start) =>
  fc
    .integer({ min: 0, max: 8 })
    .chain((n) => arbEditedStates(start, n))
    .map((rest) => [start, ...rest]),
);

// Property 4
describe("case-match carry-over of caseName _Requirements: 1.9, 1.11_", () => {
  it("a kept citation keeps its name, and every record's name is the one extract reads at its start", () => {
    let keptSeen = 0;
    fc.assert(
      fc.property(arbHistory, (history) => {
        history.forEach((doc, i) => {
          const extracted = extract(doc.text).citations;
          for (const rec of fullRecords(doc)) {
            const at = extracted.find((c) => c.start === rec.citation.start);
            expect(at).toBeDefined();
            expect(rec.citation.caseName).toBe(at?.caseName);
          }
          const prev = i === 0 ? undefined : history[i - 1];
          if (prev === undefined) return;
          const before = new Map(fullRecords(prev).map((r) => [r.key, r] as const));
          for (const rec of fullRecords(doc)) {
            const old = before.get(rec.key);
            if (old === undefined) continue;
            keptSeen += 1;
            expect(rec.citation.caseName).toBe(old.citation.caseName);
          }
        });
      }),
      runs(),
    );
    expect(keptSeen).toBeGreaterThan(0);
  });
});
