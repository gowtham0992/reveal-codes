import fc from "fast-check";
import type { CitationRecord, Document, VerificationResult } from "../../src/types";
import { expect } from "vitest";
import { createDocument } from "../../src/document";
import { render } from "../../src/codes";
import { blockingIssues, issues, recordOverride } from "../../src/issues";
import { setVerification, verificationOf } from "../../src/verification";
import { arbWrongCaseResult, type WrongCaseResult } from "../../src/testing/arbitraries";
import { arbNamedDocument, fullRecords, TIMESTAMP } from "./case-match-scenario";

export type Plan = Readonly<{
  wrong: boolean;
  overridden: boolean;
  result: WrongCaseResult;
  reason: string;
}>;

export const arbPlan: fc.Arbitrary<Plan> = fc.record({
  wrong: fc.boolean(),
  overridden: fc.boolean(),
  result: arbWrongCaseResult,
  reason: fc.string({ minLength: 1, maxLength: 20 }).filter((r) => r.trim() !== ""),
});

export type Payload = Readonly<Record<string, unknown>>;

export const arbBadText: fc.Arbitrary<unknown> = fc.oneof(
  fc.constant(""),
  fc.constant(undefined),
  fc.constant(null),
  fc.integer(),
  fc.boolean(),
  fc.array(fc.string(), { maxLength: 2 }),
);

export const arbGoodText: fc.Arbitrary<unknown> = fc.string({ minLength: 1, maxLength: 8 });

export const arbBadYear: fc.Arbitrary<unknown> = fc.oneof(
  fc.integer({ min: -100000, max: 999 }),
  fc.integer({ min: 10000, max: 1000000 }),
  fc.double({ noInteger: true, min: 1000, max: 9999 }),
  fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY),
  fc.string({ maxLength: 6 }),
  fc.constant(null),
  fc.constant("2009"),
);

export const arbGoodYear: fc.Arbitrary<number> = fc.integer({ min: 1000, max: 9999 });

/** A wrong_case payload whose three fields are each good or bad, with `foundYear` possibly absent. */
export const arbPayload: fc.Arbitrary<Payload> = fc
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
export function firstBadField(p: Payload): string | null {
  const text = (v: unknown): boolean => typeof v === "string" && v.length > 0;
  if (!text(p["clusterId"])) return "clusterId";
  if (!text(p["foundName"])) return "foundName";
  if (!("foundYear" in p)) return null;
  const y = p["foundYear"];
  return typeof y === "number" && Number.isInteger(y) && y >= 1000 && y <= 9999
    ? null
    : "foundYear";
}

export const SHORT_FORM_TEXT = "The rule is in 410 U.S. 113, 116 (1973). Id. at 118.";

/** A result of any status, with distinct payloads so two results of one status can differ. */
export const arbAnyResult: fc.Arbitrary<VerificationResult> = fc.oneof(
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
export const arbIssueResult: fc.Arbitrary<VerificationResult> = arbAnyResult.filter(
  (r) => r.status !== "verified",
);

export const SHORT_TAILS = ["Id.", "Id. at 118", "Id. at 120-21"] as const;

export type Group = Readonly<{
  shorts: readonly (typeof SHORT_TAILS)[number][];
  result: WrongCaseResult;
}>;

export const arbGroup: fc.Arbitrary<Group> = fc.record({
  shorts: fc.array(fc.constantFrom(...SHORT_TAILS), { minLength: 1, maxLength: 3 }),
  result: arbWrongCaseResult,
});

export const GROUP_CITATIONS = [
  "410 U.S. 113, 116 (1973)",
  "598 F.3d 1, 7 (2d Cir. 2010)",
] as const;

export type ShortRecord = Extract<CitationRecord, { kind: "short" }>;

/** A named-citation Document with a wrong_case result written to some Full_Citations. */
export const arbWrongCaseDocument: fc.Arbitrary<Document> = fc
  .tuple(arbNamedDocument, fc.array(arbWrongCaseResult, { minLength: 3, maxLength: 3 }))
  .map(([start, results]) =>
    fullRecords(start).reduce((doc, rec, i) => {
      const result = results[i];
      if (result === undefined) return doc;
      const set = setVerification(doc, rec.key, result);
      return set.ok ? set.value : doc;
    }, start),
  );

type Applied = Readonly<{ doc: Document; chosen: Set<string>; overridden: Set<string> }>;

/** Writes each plan's result, then the planned Overrides, to the Document's Full_Citations. */
function applyPlans(start: Document, plans: readonly Plan[]): Applied {
  let doc = start;
  const chosen = new Set<string>();
  fullRecords(start).forEach((rec, i) => {
    const plan = plans[i];
    if (plan === undefined) return;
    const status = plan.wrong ? plan.result : { status: "verified" as const, clusterId: "1" };
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
  return { doc, chosen, overridden };
}

/** Property 5 body: returns how many wrong_case citations the run chose. */
export function checkWrongCaseBlocks(start: Document, plans: readonly Plan[]): number {
  const { doc, chosen, overridden } = applyPlans(start, plans);
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
  return chosen.size;
}

/** The Document of the groups, with each group's wrong_case result on its Full_Citation. */
function groupDocument(groups: readonly Group[]): Document {
  const text = groups
    .map((g, i) => `See ${GROUP_CITATIONS[i] ?? GROUP_CITATIONS[0]}. ${g.shorts.join(" ")}.`)
    .join("\n\n");
  const created = createDocument(text, TIMESTAMP);
  if (!created.ok) throw new Error("groupDocument: createDocument rejected generated text");
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
  return doc;
}

type Rendered = ReturnType<typeof render>;

function codeAt(r: Rendered, offset: number): string[] {
  return r.positions
    .filter((p) => p.offset === offset && p.code.startsWith("[CIT"))
    .map((p) => p.code);
}

/** Each linked Short_Form reports its target's wrong_case result and has its own full-form opener. */
function assertShortsFollow(doc: Document, shorts: readonly ShortRecord[]): number {
  const fullMode = render(doc, "full");
  const issueKeys = new Set(issues(doc).map((x) => x.key));
  let seen = 0;
  for (const s of shorts) {
    const value = s.citation.value;
    if (value.kind !== "short" || value.targetStart === null) continue;
    const targetNow = fullRecords(doc).find((f) => f.citation.start === value.targetStart);
    expect(targetNow?.result.status).toBe("wrong_case");
    seen += 1;
    expect(verificationOf(doc, s.key)).toEqual(targetNow?.result);
    expect(issueKeys.has(s.key)).toBe(false);
    // Offsets in `positions` are into the rendered text, so find this Short_Form's
    // opener by its unique key in the full form.
    const opener = `[CIT ≠{k=${s.key}}]`;
    const fullOpeners = fullMode.positions.filter((p) => p.code === opener);
    expect(fullOpeners).toHaveLength(1);
    expect(codeAt(fullMode, fullOpeners[0]?.offset ?? -1)).toContain(opener);
  }
  return seen;
}

/** One opener per Full_Citation plus one per linked Short_Form, in each mode. */
function assertOpenerCounts(doc: Document, groups: number, shortCount: number): void {
  const fullMode = render(doc, "full");
  const displayMode = render(doc, "display");
  const wrongOpeners = (r: Rendered): number =>
    r.positions.filter((p) => p.code.startsWith("[CIT ≠")).length;
  expect(wrongOpeners(fullMode)).toBe(groups + shortCount);
  expect(wrongOpeners(displayMode)).toBe(groups + shortCount);
  expect(displayMode.positions.filter((p) => p.code === "[CIT ≠]")).toHaveLength(
    groups + shortCount,
  );
  expect(
    fullMode.positions.filter(
      (p) => p.code.startsWith("[CIT ≠") && p.code.includes("{k=") && /;/.test(p.code),
    ),
  ).toHaveLength(groups);
}

/** Property 8 body: returns how many linked Short_Forms were checked. */
export function checkShortFollows(groups: readonly Group[]): number {
  const doc = groupDocument(groups);
  const shorts = doc.citations.filter((c): c is ShortRecord => c.kind === "short");
  expect(shorts.length).toBeGreaterThanOrEqual(groups.length);
  const seen = assertShortsFollow(doc, shorts);
  assertOpenerCounts(doc, groups.length, seen);
  return seen;
}
