import * as fc from "fast-check";
import { POOL_A_M, POOL_N_Z, arbPooledCaseName } from "../../../engine/src/testing/arb-case-match";
import type { CitationRecord, IssueKey, VerificationResult } from "@reveal-codes/engine";
import { chunkLines } from "../../src/chunk";
import { createDeps } from "../../src/create-deps";
import { lookup, lookupWithInfo, planLookup } from "../../src/lookup";
import type { LookupInfo } from "../../src/lookup";
import { namesMatch } from "../../src/name-match";
import { TEST_BASE_URL, makeDeps } from "./make-deps";
import type { TestDeps } from "./make-deps";
import { scriptedFetch } from "./scripted-fetch";
import type { ScriptStep } from "./scripted-fetch";

export type LineKind = "200" | "300" | "400" | "404" | "429" | "junk";
export type Datum = Readonly<{
  caseName: string | undefined;
  full: string | undefined;
  short: string | undefined;
  date: string | undefined;
}>;
export type RecSpec = Readonly<{
  /** Two line indexes for a Parallel_Citation, or null for a single reporter citation. */
  parallel: readonly [number, number] | null;
  line: number;
  cited: string | undefined;
}>;
export type Scenario = Readonly<{
  kinds: readonly LineKind[];
  clusterOf: readonly number[];
  data: readonly [Datum, Datum];
  records: readonly RecSpec[];
}>;

export const LINE_COUNT = 3;
export const lineText = (i: number): string => `${String(100 + i)} U.S. 1`;
export const member = (i: number): { volume: number; reporter: string; page: number } => ({
  volume: 100 + i,
  reporter: "U.S.",
  page: 1,
});

export const arbScenario: fc.Arbitrary<Scenario> = fc
  .tuple(
    fc.tuple(arbPooledCaseName(POOL_A_M), arbPooledCaseName(POOL_A_M)),
    arbPooledCaseName(POOL_N_Z),
  )
  .chain(([[n0, n1], other]) => {
    const nameField = fc.constantFrom<string | undefined>(undefined, "", "  ", n0, n1, other);
    const datum: fc.Arbitrary<Datum> = fc.record({
      caseName: fc.constantFrom<string | undefined>(n0, n0, n1, other, "", undefined),
      full: nameField,
      short: nameField,
      date: fc.constantFrom<string | undefined>(
        undefined,
        "2009-05-18",
        "1000-01-01",
        "0999-01-01",
        "abcd-01-01",
        "20",
      ),
    });
    const lineIdx = fc.integer({ min: 0, max: LINE_COUNT - 1 });
    const record: fc.Arbitrary<RecSpec> = fc.record({
      parallel: fc.option(fc.tuple(lineIdx, lineIdx), { nil: null }),
      line: lineIdx,
      cited: fc.constantFrom<string | undefined>(undefined, n0, n1),
    });
    return fc.record({
      kinds: fc.array(
        fc.constantFrom<LineKind>("200", "200", "200", "200", "300", "400", "404", "429", "junk"),
        { minLength: LINE_COUNT, maxLength: LINE_COUNT },
      ),
      clusterOf: fc.array(fc.constantFrom(1, 2), { minLength: LINE_COUNT, maxLength: LINE_COUNT }),
      data: fc.tuple(datum, datum),
      records: fc.array(record, { minLength: 1, maxLength: 6 }),
    });
  });

export function clusterJson(id: number, d: Datum): Record<string, unknown> {
  return {
    id,
    ...(d.caseName === undefined ? {} : { case_name: d.caseName }),
    ...(d.full === undefined ? {} : { case_name_full: d.full }),
    ...(d.short === undefined ? {} : { case_name_short: d.short }),
    ...(d.date === undefined ? {} : { date_filed: d.date }),
  };
}

export function entryOf(s: Scenario, i: number): unknown {
  const kind = s.kinds[i];
  const id = s.clusterOf[i] ?? 1;
  const [d1, d2] = s.data;
  const datum = id === 1 ? d1 : d2;
  switch (kind) {
    case "200":
      return { status: 200, clusters: [clusterJson(id, datum)] };
    case "300":
      return { status: 300, clusters: [clusterJson(1, d1), clusterJson(2, d2)] };
    case "400":
      return { status: 400, clusters: [] };
    case "404":
      return { status: 404, clusters: [] };
    case "429":
      return { status: 429, clusters: [] };
    default:
      return "junk";
  }
}

export function recordsOf(s: Scenario, withNames: boolean): CitationRecord[] {
  return s.records.map((r, i): CitationRecord => {
    const value =
      r.parallel === null
        ? ({ kind: "reporter", ...member(r.line) } as const)
        : ({ kind: "parallel", members: r.parallel.map(member) } as const);
    const text = r.parallel === null ? lineText(r.line) : r.parallel.map(lineText).join(", ");
    const caseName = withNames && r.cited !== undefined ? { caseName: r.cited } : {};
    return {
      kind: "full",
      key: `k${String(i)}`,
      citation: { start: 0, end: text.length, text, value, ...caseName },
      result: { status: "unchecked" },
    };
  });
}

export type Both = Readonly<{
  info: ReadonlyMap<IssueKey, VerificationResult>;
  plain: ReadonlyMap<IssueKey, VerificationResult>;
}>;

export async function runBoth(s: Scenario, withNames: boolean): Promise<Both> {
  const records = recordsOf(s, withNames);
  const answer = (): Awaited<ReturnType<typeof makeDeps>> => {
    const steps = planLookup(records)
      .chunks.filter((chunk) => !chunk.oversize)
      .map((chunk) => ({
        status: 200,
        body: chunk.lines.map((line) => entryOf(s, Number.parseInt(line, 10) - 100)),
      }));
    return makeDeps(steps);
  };
  const withInfo = await lookupWithInfo(records, answer().deps);
  const plain = await lookup(records, answer().deps);
  return { info: withInfo.results, plain };
}

/** The result of a line before any name comparison. */
export function lineOutcome(s: Scenario, i: number): VerificationResult {
  switch (s.kinds[i]) {
    case "200":
      return { status: "verified", clusterId: String(s.clusterOf[i] ?? 1) };
    case "300":
      return { status: "ambiguous", candidates: ["1", "2"] };
    case "400":
      return { status: "not_found", reason: "unknown_reporter" };
    case "404":
      return { status: "not_found" };
    default:
      return { status: "unchecked" };
  }
}

export const isBlank = (v: string | undefined): boolean => v === undefined || v.trim() === "";

/** The rule of Requirement 5, criterion 1, for the cluster `clusterId`. */
export function judged(
  s: Scenario,
  clusterId: string,
  cited: string | undefined,
): VerificationResult {
  const d = clusterId === "1" ? s.data[0] : s.data[1];
  const verified: VerificationResult = { status: "verified", clusterId };
  if (cited === undefined || d.caseName === undefined || isBlank(d.caseName)) return verified;
  const names = [d.caseName, d.full, d.short].filter(
    (n): n is string => n !== undefined && n.trim() !== "",
  );
  if (namesMatch(cited, names)) return verified;
  const head = d.date?.slice(0, 4);
  const year = head !== undefined && /^[0-9]{4}$/.test(head) ? Number(head) : undefined;
  return year !== undefined && year >= 1000
    ? { status: "wrong_case", clusterId, foundName: d.caseName, foundYear: year }
    : { status: "wrong_case", clusterId, foundName: d.caseName };
}

export type Expectation = VerificationResult | "unresolved";

export function expectedFor(s: Scenario, r: RecSpec): Expectation {
  if (r.parallel === null) {
    const out = lineOutcome(s, r.line);
    return out.status === "verified" ? judged(s, out.clusterId, r.cited) : out;
  }
  const verified = r.parallel.flatMap((i) => {
    const o = lineOutcome(s, i);
    return o.status === "verified" ? [o.clusterId] : [];
  });
  const ids = [...new Set(verified)];
  const [only] = ids;
  if (ids.length === 0 || only === undefined) return "unresolved";
  return ids.length === 1 ? judged(s, only, r.cited) : { status: "ambiguous", candidates: ids };
}

// ---- Property 10 harness: a second run on the same cache. ----

/** Only line kinds that are cached (200, 300, 400, 404); `unchecked` outcomes are never cached. */
export const arbCachedScenario: fc.Arbitrary<Scenario> = arbScenario.map((s) => ({
  ...s,
  kinds: s.kinds.map((k): LineKind => (k === "429" || k === "junk" ? "200" : k)),
}));

/** Scripted answers for the chunks of `lines`, in the order `lookupWithInfo` requests them. */
export function stepsFor(s: Scenario, lines: readonly string[]): ScriptStep[] {
  return chunkLines(lines).map((chunk) => ({
    status: 200,
    body: chunk.lines.map((line) => entryOf(s, Number.parseInt(line, 10) - 100)),
  }));
}

/** Fresh fetch and deps over the cache and clock of an earlier run. */
export function sharedCacheDeps(first: TestDeps, steps: readonly ScriptStep[]): TestDeps {
  const fetch = scriptedFetch(steps);
  const deps = createDeps({
    fetch: fetch.fetch,
    now: first.clock.now,
    sleep: first.clock.sleep,
    cache: first.cache,
    baseUrl: TEST_BASE_URL,
  });
  return { deps, fetch, clock: first.clock, cache: first.cache };
}

export async function firstRun(
  s: Scenario,
  records: CitationRecord[],
): Promise<[TestDeps, LookupInfo]> {
  const lines = planLookup(records).lines;
  const first = makeDeps(stepsFor(s, lines));
  return [first, await lookupWithInfo(records, first.deps)];
}

// ---- Property 11 harness: the requests of a run over records with and without case names. ----

/** Every request of a run with a token configured, over fresh deps and the scenario's answers. */
export async function requestsOf(
  s: Scenario,
  records: CitationRecord[],
): Promise<ReturnType<typeof makeDeps>["fetch"]["calls"]> {
  const steps = planLookup(records)
    .chunks.filter((chunk) => !chunk.oversize)
    .map((chunk) => ({
      status: 200,
      body: chunk.lines.map((line) => entryOf(s, Number.parseInt(line, 10) - 100)),
    }));
  const run = makeDeps(steps, { token: "tok-secret" });
  await lookupWithInfo(records, run.deps);
  return run.fetch.calls;
}
