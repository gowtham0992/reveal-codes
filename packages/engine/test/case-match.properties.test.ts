import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { extract } from "../src/citations/extract";
import { apply, createDocument } from "../src/document";
import { blockingIssues, issues, recordOverride } from "../src/issues";
import { render } from "../src/codes/render";
import { setVerification, verificationOf } from "../src/verification";
import type { CitationRecord, Document, VerificationResult } from "../src/types";
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

/** A result of any status, with distinct payloads so two results of one status can differ. */
const arbAnyResult: fc.Arbitrary<VerificationResult> = fc.oneof(
  fc.string({ minLength: 1, maxLength: 6 }).map((clusterId) => ({
    status: "verified" as const,
    clusterId,
  })),
  arbWrongCaseResult,
  fc
    .uniqueArray(fc.string({ minLength: 1, maxLength: 6 }), { minLength: 2, maxLength: 4 })
    .map((candidates) => ({ status: "ambiguous" as const, candidates })),
  fc.constant({ status: "not_found" as const }),
  fc.constant({ status: "unchecked" as const }),
);

/** A result that raises an Issue, so an Override can be recorded against it. */
const arbIssueResult: fc.Arbitrary<VerificationResult> = arbAnyResult.filter(
  (r) => r.status !== "verified",
);

// Property 7
describe("case-match an Override survives only an unchanged status _Requirements: 2.9_", () => {
  it("keeps the Override iff the new result has the previous status, including wrong_case to wrong_case with a new cluster or name", () => {
    let kept = 0;
    let dropped = 0;
    let wrongToWrong = 0;
    fc.assert(
      fc.property(
        arbNamedDocument,
        fc.nat(),
        arbIssueResult,
        arbAnyResult,
        fc.string({ minLength: 1, maxLength: 20 }).filter((r) => r.trim() !== ""),
        (start, pick, previous, next, reason) => {
          const records = fullRecords(start);
          const rec = records[pick % records.length];
          if (rec === undefined) return;
          const first = setVerification(start, rec.key, previous);
          if (!first.ok) return; // an unlisted Database_Citation is not verifiable
          const overridden = recordOverride(first.value, rec.key, reason, TIMESTAMP);
          expect(overridden.ok).toBe(true);
          if (!overridden.ok) return;
          const before = overridden.value;
          expect(before.overrides.some((o) => o.key === rec.key)).toBe(true);

          const second = setVerification(before, rec.key, next);
          expect(second.ok).toBe(true);
          if (!second.ok) return;

          const survives = second.value.overrides.some((o) => o.key === rec.key);
          expect(survives).toBe(previous.status === next.status);
          if (survives) {
            kept += 1;
            const original = before.overrides.find((o) => o.key === rec.key);
            expect(second.value.overrides.find((o) => o.key === rec.key)).toEqual(original);
            if (
              previous.status === "wrong_case" &&
              JSON.stringify(previous) !== JSON.stringify(next)
            )
              wrongToWrong += 1;
          } else dropped += 1;
          // Overrides on the other citations are untouched.
          expect(second.value.overrides.filter((o) => o.key !== rec.key)).toEqual(
            before.overrides.filter((o) => o.key !== rec.key),
          );
        },
      ),
      runs(),
    );
    expect(kept).toBeGreaterThan(0);
    expect(dropped).toBeGreaterThan(0);
    expect(wrongToWrong).toBeGreaterThan(0);
  });
});

const SHORT_TAILS = ["Id.", "Id. at 118", "Id. at 120-21"] as const;

type Group = Readonly<{ shorts: readonly (typeof SHORT_TAILS)[number][]; result: WrongCaseResult }>;

const arbGroup: fc.Arbitrary<Group> = fc.record({
  shorts: fc.array(fc.constantFrom(...SHORT_TAILS), { minLength: 1, maxLength: 3 }),
  result: arbWrongCaseResult,
});

const GROUP_CITATIONS = ["410 U.S. 113, 116 (1973)", "598 F.3d 1, 7 (2d Cir. 2010)"] as const;

type ShortRecord = Extract<CitationRecord, { kind: "short" }>;

// Property 8
describe("case-match a Short_Form follows a wrong_case target _Requirements: 2.10, 3.2_", () => {
  it("reports the target's wrong_case result, lists no Issue, and renders [CIT ≠{k=<key>}] in full form and [CIT ≠] in display form", () => {
    let shortsSeen = 0;
    fc.assert(
      fc.property(fc.array(arbGroup, { minLength: 1, maxLength: 2 }), (groups) => {
        const text = groups
          .map((g, i) => `See ${GROUP_CITATIONS[i]}. ${g.shorts.join(" ")}.`)
          .join("\n\n");
        const created = createDocument(text, TIMESTAMP);
        expect(created.ok).toBe(true);
        if (!created.ok) return;
        let doc = created.value;
        const fulls = fullRecords(doc);
        expect(fulls.length).toBe(groups.length);
        groups.forEach((g, i) => {
          const full = fulls[i];
          if (full === undefined) return;
          const set = setVerification(doc, full.key, g.result);
          expect(set.ok).toBe(true);
          if (set.ok) doc = set.value;
        });

        const shortIssueKeys = new Set(issues(doc).map((x) => x.key));
        const fullMode = render(doc, "full");
        const displayMode = render(doc, "display");
        const codeAt = (r: typeof fullMode, offset: number): string[] =>
          r.positions
            .filter((p) => p.offset === offset && p.code.startsWith("[CIT"))
            .map((p) => p.code);

        const shorts = doc.citations.filter((c): c is ShortRecord => c.kind === "short");
        expect(shorts.length).toBeGreaterThanOrEqual(groups.length);
        for (const s of shorts) {
          const value = s.citation.value;
          if (value.kind !== "short" || value.targetStart === null) continue;
          const target = fulls.find((f) => f.citation.start === value.targetStart);
          const targetNow = fullRecords(doc).find((f) => f.citation.start === value.targetStart);
          expect(target).toBeDefined();
          expect(targetNow?.result.status).toBe("wrong_case");
          shortsSeen += 1;

          expect(verificationOf(doc, s.key)).toEqual(targetNow?.result);
          expect(shortIssueKeys.has(s.key)).toBe(false);

          // Offsets in `positions` are into the rendered text, so find this Short_Form's
          // opener by its unique key in the full form, and by order in the display form.
          const fullOpeners = fullMode.positions.filter((p) => p.code === `[CIT ≠{k=${s.key}}]`);
          expect(fullOpeners).toHaveLength(1);
          const at = fullOpeners[0]?.offset ?? -1;
          expect(codeAt(fullMode, at)).toContain(`[CIT ≠{k=${s.key}}]`);
        }

        const shortCount = shorts.filter(
          (s) => s.citation.value.kind === "short" && s.citation.value.targetStart !== null,
        ).length;
        const wrongOpeners = (r: typeof fullMode): number =>
          r.positions.filter((p) => p.code.startsWith("[CIT ≠")).length;
        // One opener per Full_Citation plus one per linked Short_Form, in each mode.
        expect(wrongOpeners(fullMode)).toBe(groups.length + shortCount);
        expect(wrongOpeners(displayMode)).toBe(groups.length + shortCount);
        expect(displayMode.positions.filter((p) => p.code === "[CIT ≠]")).toHaveLength(
          groups.length + shortCount,
        );
        expect(
          fullMode.positions.filter(
            (p) => p.code.startsWith("[CIT ≠") && p.code.includes("{k=") && /;/.test(p.code),
          ),
        ).toHaveLength(groups.length);
      }),
      runs(),
    );
    expect(shortsSeen).toBeGreaterThan(0);
  });
});
