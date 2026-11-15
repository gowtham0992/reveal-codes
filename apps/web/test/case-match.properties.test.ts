import * as fc from "fast-check";
import { setVerification } from "@reveal-codes/engine";
import type { Document, IssueKey, VerificationResult } from "@reveal-codes/engine";
import type { DisplayInfo } from "@reveal-codes/verifier/link";
import { describe, expect, it } from "vitest";
import { resolvedRows } from "../src/client/resolved";
import type { ResolvedSession } from "../src/client/resolved";
import { CLUSTER_POOL, arbCitingDocument } from "./arbitraries";
import { runs } from "./support/fc";

const OTHER_CLUSTER = "999";

type InfoKind = "none" | "same" | "other";

type Choice = Readonly<{
  result: VerificationResult;
  infoKind: InfoKind;
  foundYear: number | undefined;
  absoluteUrl: string | undefined;
}>;

const arbCluster = fc.constantFrom(...CLUSTER_POOL);

const arbResult: fc.Arbitrary<VerificationResult> = fc.oneof(
  {
    arbitrary: arbCluster.map((clusterId) => ({ status: "verified" as const, clusterId })),
    weight: 4,
  },
  {
    arbitrary: arbCluster.map((clusterId) => ({
      status: "wrong_case" as const,
      clusterId,
      foundName: "Some Other v. Case",
      foundYear: 2009,
    })),
    weight: 2,
  },
  { arbitrary: fc.constant({ status: "not_found" as const }), weight: 1 },
  { arbitrary: fc.constant({ status: "unchecked" as const }), weight: 1 },
  {
    arbitrary: fc.constant({ status: "ambiguous" as const, candidates: ["101", "102"] }),
    weight: 1,
  },
);

const arbChoice: fc.Arbitrary<Choice> = fc.record({
  result: arbResult,
  infoKind: fc.constantFrom<InfoKind>("none", "same", "same", "other"),
  foundYear: fc.option(fc.integer({ min: 1000, max: 2100 }), { nil: undefined }),
  absoluteUrl: fc.option(fc.constantFrom("/opinion/101/x/", "/opinion/102/y/"), { nil: undefined }),
});

type Scenario = Readonly<{
  doc: Document;
  info: ReadonlyMap<IssueKey, DisplayInfo>;
  /** Whether a session exists, its epoch and the current epoch. */
  session: ReadonlyArray<number> | null;
  currentEpoch: number;
}>;

function infoFor(key: IssueKey, c: Choice, doc: Document): DisplayInfo | null {
  if (c.infoKind === "none") return null;
  const rec = doc.citations.find((x) => x.kind === "full" && x.key === key);
  const own =
    rec !== undefined && rec.kind === "full" && "clusterId" in rec.result
      ? rec.result.clusterId
      : CLUSTER_POOL[0];
  return {
    clusterId: c.infoKind === "same" ? (own ?? OTHER_CLUSTER) : OTHER_CLUSTER,
    foundName: `Found ${key}`,
    ...(c.foundYear === undefined ? {} : { foundYear: c.foundYear }),
    ...(c.absoluteUrl === undefined ? {} : { absoluteUrl: c.absoluteUrl }),
  };
}

function assign(doc: Document, choices: readonly Choice[]): Scenario["doc"] {
  let current = doc;
  const fulls = doc.citations.filter((c) => c.kind === "full");
  fulls.forEach((c, i) => {
    const choice = choices[i % choices.length];
    if (choice === undefined) return;
    const next = setVerification(current, c.key, choice.result);
    if (next.ok) current = next.value;
  });
  return current;
}

const arbScenario: fc.Arbitrary<{
  doc: Document;
  choices: readonly Choice[];
  session: readonly [number] | null;
  currentEpoch: number;
}> = fc.record({
  doc: arbCitingDocument,
  choices: fc.array(arbChoice, { minLength: 1, maxLength: 8 }),
  session: fc.option(fc.tuple(fc.nat({ max: 3 })), { nil: null }),
  currentEpoch: fc.nat({ max: 3 }),
});

function foundTextOf(info: DisplayInfo): string {
  return info.foundYear === undefined
    ? info.foundName
    : `${info.foundName} (${String(info.foundYear)})`;
}

describe("Resolved list selection _Requirements: 7.5, 7.12, 7.13, 7.14, 7.15, 7.17_", () => {
  // Property 16
  it("lists exactly the verified Full_Citations in order, with found text only for a current, same-cluster Display_Info", () => {
    fc.assert(
      fc.property(arbScenario, (s) => {
        const doc = assign(s.doc, s.choices);
        const fulls = doc.citations.filter((c) => c.kind === "full");
        const info = new Map<IssueKey, DisplayInfo>();
        fulls.forEach((c, i) => {
          const choice = s.choices[i % s.choices.length];
          const made = choice === undefined ? null : infoFor(c.key, choice, doc);
          if (made !== null) info.set(c.key, made);
        });
        const session: ResolvedSession = s.session === null ? null : { epoch: s.session[0], info };
        const rows = resolvedRows(doc, session, s.currentEpoch);

        if (session === null) {
          expect(rows).toBeNull();
          return;
        }
        const expected = doc.citations.flatMap((c) =>
          c.kind === "full" && c.result.status === "verified" ? [c] : [],
        );
        expect(rows).not.toBeNull();
        expect((rows ?? []).map((r) => r.key)).toEqual(expected.map((c) => c.key));
        (rows ?? []).forEach((row, i) => {
          const c = expected[i];
          if (c === undefined || c.result.status !== "verified") throw new Error("unreachable");
          const d = info.get(c.key);
          const usable =
            session.epoch === s.currentEpoch &&
            d !== undefined &&
            d.clusterId === c.result.clusterId;
          expect(row.clusterId).toBe(c.result.clusterId);
          expect(row.found).toBe(usable ? foundTextOf(d) : null);
        });
      }),
      { numRuns: runs() },
    );
  });
});
