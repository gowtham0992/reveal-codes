import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { extract } from "../src/citations/extract";
import { apply, createDocument } from "../src/document";
import { blockingIssues, issues, recordOverride } from "../src/issues";
import { setVerification } from "../src/verification";
import type { CitationRecord, Document } from "../src/types";
import {
  arbWrongCaseResult,
  type WrongCaseResult,
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

type Plan = Readonly<{
  wrong: boolean;
  overridden: boolean;
  result: WrongCaseResult;
  reason: string;
}>;

const arbPlan: fc.Arbitrary<Plan> = fc.record({
  wrong: fc.boolean(),
  overridden: fc.boolean(),
  result: arbWrongCaseResult,
  reason: fc.string({ minLength: 1, maxLength: 20 }).filter((r) => r.trim() !== ""),
});

// Property 5
describe("case-match wrong_case blocks export _Requirements: 2.6, 2.7, 2.8, 2.11_", () => {
  it("lists each wrong_case citation once as CIT ≠, blocks exactly the ones without an Override, and blocking is empty iff all are overridden", () => {
    let wrongSeen = 0;
    fc.assert(
      fc.property(
        arbNamedDocument,
        fc.array(arbPlan, { minLength: 6, maxLength: 6 }),
        (start, plans) => {
          let doc = start;
          const chosen = new Set<string>();
          fullRecords(start).forEach((rec, i) => {
            const plan = plans[i];
            if (plan === undefined) return;
            const status = plan.wrong
              ? plan.result
              : { status: "verified" as const, clusterId: "1" };
            const set = setVerification(doc, rec.key, status);
            if (!set.ok) return; // a Database_Citation with an unlisted court is not verifiable
            doc = set.value;
            if (plan.wrong) chosen.add(rec.key);
          });
          const overridden = new Set<string>();
          fullRecords(start).forEach((rec, i) => {
            const plan = plans[i];
            if (plan === undefined || !chosen.has(rec.key) || !plan.overridden) return;
            const done = recordOverride(doc, rec.key, plan.reason, TIMESTAMP);
            expect(done.ok).toBe(true);
            if (!done.ok) return;
            doc = done.value;
            overridden.add(rec.key);
          });
          wrongSeen += chosen.size;

          const wrongIssues = issues(doc).filter((x) => x.code === "CIT ≠");
          expect(wrongIssues.map((x) => x.key).sort()).toEqual([...chosen].sort());
          for (const x of wrongIssues) expect(x.kind).toBe("citation");

          const blocking = blockingIssues(doc);
          const blockingWrong = blocking.filter((x) => x.code === "CIT ≠").map((x) => x.key);
          const expected = [...chosen].filter((k) => !overridden.has(k));
          expect(blockingWrong.sort()).toEqual(expected.sort());

          // Every other Issue here is a citation left unchecked; none is a wrong_case one.
          const overrideKeys = new Set(doc.overrides.map((o) => o.key));
          expect(blocking.map((x) => x.key)).toEqual(
            issues(doc)
              .filter((x) => !overrideKeys.has(x.key))
              .map((x) => x.key),
          );
          const others = blocking.filter((x) => x.code !== "CIT ≠");
          expect(blocking.length === 0).toBe(expected.length === 0 && others.length === 0);
        },
      ),
      runs(),
    );
    expect(wrongSeen).toBeGreaterThan(0);
  });
});

type Payload = Readonly<Record<string, unknown>>;

const arbBadText: fc.Arbitrary<unknown> = fc.oneof(
  fc.constant(""),
  fc.constant(undefined),
  fc.constant(null),
  fc.integer(),
  fc.boolean(),
  fc.array(fc.string(), { maxLength: 2 }),
);

const arbGoodText: fc.Arbitrary<unknown> = fc.string({ minLength: 1, maxLength: 8 });

const arbBadYear: fc.Arbitrary<unknown> = fc.oneof(
  fc.integer({ min: -100000, max: 999 }),
  fc.integer({ min: 10000, max: 1000000 }),
  fc.double({ noInteger: true, min: 1000, max: 9999 }),
  fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY),
  fc.string({ maxLength: 6 }),
  fc.constant(null),
  fc.constant("2009"),
);

const arbGoodYear: fc.Arbitrary<number> = fc.integer({ min: 1000, max: 9999 });

/** A wrong_case payload whose three fields are each good or bad, with `foundYear` possibly absent. */
const arbPayload: fc.Arbitrary<Payload> = fc
  .tuple(
    fc.oneof(arbGoodText, arbBadText),
    fc.oneof(arbGoodText, arbBadText),
    fc.oneof(
      fc.constant({ absent: true } as const),
      arbGoodYear.map((v) => ({ absent: false, v }) as const),
      arbBadYear.map((v) => ({ absent: false, v }) as const),
    ),
  )
  .map(([clusterId, foundName, year]) => ({
    status: "wrong_case",
    clusterId,
    foundName,
    ...(year.absent ? {} : { foundYear: year.v }),
  }));

/** The first failing field among clusterId, foundName, foundYear, computed independently of the Engine. */
function firstBadField(p: Payload): string | null {
  const text = (v: unknown): boolean => typeof v === "string" && v.length > 0;
  if (!text(p["clusterId"])) return "clusterId";
  if (!text(p["foundName"])) return "foundName";
  if (!("foundYear" in p)) return null;
  const y = p["foundYear"];
  return typeof y === "number" && Number.isInteger(y) && y >= 1000 && y <= 9999
    ? null
    : "foundYear";
}

const SHORT_FORM_TEXT = "The rule is in 410 U.S. 113, 116 (1973). Id. at 118.";

// Property 6
describe("case-match malformed wrong_case is rejected and named _Requirements: 2.3, 2.4, 2.5_", () => {
  it("stores a well-formed payload, otherwise names the first failing field and leaves the Document unchanged", () => {
    let rejected = 0;
    let stored = 0;
    fc.assert(
      fc.property(arbNamedDocument, arbPayload, (doc, payload) => {
        const before = structuredClone(doc);
        const expectedField = firstBadField(payload);
        for (const rec of fullRecords(doc)) {
          const set = setVerification(doc, rec.key, payload as unknown as WrongCaseResult);
          const v = rec.citation.value;
          if (!set.ok && set.error.kind === "not_verifiable") {
            // Only an unlisted Database_Citation is not verifiable among Full_Citations.
            expect(v.kind === "database" && v.lexisCourtListed === false).toBe(true);
            expect(doc).toEqual(before);
            continue;
          }
          if (expectedField === null) {
            expect(set.ok).toBe(true);
            if (!set.ok) continue;
            stored += 1;
            const written = fullRecords(set.value).find((r) => r.key === rec.key);
            expect(written?.result).toEqual(payload);
          } else {
            rejected += 1;
            expect(set.ok).toBe(false);
            if (set.ok) continue;
            expect(set.error).toEqual({
              kind: "invalid_verification_result",
              field: expectedField,
            });
          }
          expect(doc).toEqual(before);
        }
      }),
      runs(),
    );
    expect(stored).toBeGreaterThan(0);
    expect(rejected).toBeGreaterThan(0);
  });

  it("returns not_verifiable for a Short_Form key whatever the payload", () => {
    const created = createDocument(SHORT_FORM_TEXT, TIMESTAMP);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const doc = created.value;
    const shorts = doc.citations.filter((r) => r.kind === "short");
    expect(shorts.length).toBeGreaterThan(0);
    fc.assert(
      fc.property(arbPayload, (payload) => {
        const before = structuredClone(doc);
        for (const s of shorts) {
          const set = setVerification(doc, s.key, payload as unknown as WrongCaseResult);
          expect(set.ok).toBe(false);
          if (set.ok) continue;
          expect(set.error).toEqual({ kind: "not_verifiable", key: s.key });
        }
        expect(doc).toEqual(before);
      }),
      runs(),
    );
  });
});
