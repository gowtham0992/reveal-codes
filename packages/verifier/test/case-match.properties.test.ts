// Properties of the case-match spec for the verifier. Other verifier property
// tasks (9, 10, 11, 12, 13, 18) append their describe blocks to this file.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  POOL_A_M,
  POOL_N_Z,
  arbDisjointNames,
  arbNameVariant,
  arbPooledCaseName,
} from "../../engine/src/testing/arb-case-match";
import type { CitationRecord, IssueKey, VerificationResult } from "@reveal-codes/engine";
import { cacheSet } from "../src/cache-access";
import { chunkLines } from "../src/chunk";
import { createDeps } from "../src/create-deps";
import { lookup, lookupWithInfo, planLookup } from "../src/lookup";
import type { LookupInfo } from "../src/lookup";
import { courtListenerLink } from "../src/link";
import { namesMatch } from "../src/name-match";
import { runs } from "./support/fc";
import { TEST_BASE_URL, makeDeps } from "./support/make-deps";
import type { TestDeps } from "./support/make-deps";
import { scriptedFetch } from "./support/scripted-fetch";
import type { ScriptStep } from "./support/scripted-fetch";

type NamePair = Readonly<{ cited: string; found: string; expected: boolean }>;

/** Positive pairs by transformation of a generated name, and negative pairs from disjoint letter pools. */
const arbNamePair: fc.Arbitrary<NamePair> = fc.oneof(
  arbPooledCaseName(POOL_A_M).chain(arbNameVariant),
  arbDisjointNames.map(({ cited, found }) => ({ cited, found, expected: false })),
);

// Feature: case-match, Property 1: names match through case, punctuation, abbreviation and initialism
// Property 1
describe("Property 1: Name matching _Requirements: 4.12_", () => {
  it("matches a name through case, punctuation, abbreviation and initialism, and never across disjoint names", () => {
    fc.assert(
      fc.property(arbNamePair, ({ cited, found, expected }) => {
        const first = namesMatch(cited, [found]);
        expect(first).toBe(expected);
        expect(namesMatch(cited, [found])).toBe(first);
        if (expected) expect(namesMatch(found, [cited])).toBe(true);
      }),
      { numRuns: runs() },
    );
  });
});

// ---- Property 9 harness: records over three shared lines, one scripted lookup answer per line. ----

type LineKind = "200" | "300" | "400" | "404" | "429" | "junk";
type Datum = Readonly<{
  caseName: string | undefined;
  full: string | undefined;
  short: string | undefined;
  date: string | undefined;
}>;
type RecSpec = Readonly<{
  /** Two line indexes for a Parallel_Citation, or null for a single reporter citation. */
  parallel: readonly [number, number] | null;
  line: number;
  cited: string | undefined;
}>;
type Scenario = Readonly<{
  kinds: readonly LineKind[];
  clusterOf: readonly number[];
  data: readonly [Datum, Datum];
  records: readonly RecSpec[];
}>;

const LINE_COUNT = 3;
const lineText = (i: number): string => `${String(100 + i)} U.S. 1`;
const member = (i: number): { volume: number; reporter: string; page: number } => ({
  volume: 100 + i,
  reporter: "U.S.",
  page: 1,
});

const arbScenario: fc.Arbitrary<Scenario> = fc
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

function clusterJson(id: number, d: Datum): Record<string, unknown> {
  return {
    id,
    ...(d.caseName === undefined ? {} : { case_name: d.caseName }),
    ...(d.full === undefined ? {} : { case_name_full: d.full }),
    ...(d.short === undefined ? {} : { case_name_short: d.short }),
    ...(d.date === undefined ? {} : { date_filed: d.date }),
  };
}

function entryOf(s: Scenario, i: number): unknown {
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

function recordsOf(s: Scenario, withNames: boolean): CitationRecord[] {
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

type Both = Readonly<{
  info: ReadonlyMap<IssueKey, VerificationResult>;
  plain: ReadonlyMap<IssueKey, VerificationResult>;
}>;

async function runBoth(s: Scenario, withNames: boolean): Promise<Both> {
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
function lineOutcome(s: Scenario, i: number): VerificationResult {
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

const isBlank = (v: string | undefined): boolean => v === undefined || v.trim() === "";

/** The rule of Requirement 5, criterion 1, for the cluster `clusterId`. */
function judged(s: Scenario, clusterId: string, cited: string | undefined): VerificationResult {
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

type Expectation = VerificationResult | "unresolved";

function expectedFor(s: Scenario, r: RecSpec): Expectation {
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

// Feature: case-match, Property 9: the verifier rule
// Property 9
describe("Property 9: The verifier rule _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.14_", () => {
  it("judges each record by its own name against its cluster, leaves other statuses alone, and lookup equals lookupWithInfo", async () => {
    await fc.assert(
      fc.asyncProperty(arbScenario, async (s) => {
        const named = await runBoth(s, true);
        const bare = await runBoth(s, false);
        // `lookup` returns the results of `lookupWithInfo` for the same input (5.14).
        expect(named.plain).toEqual(named.info);
        expect(bare.plain).toEqual(bare.info);
        s.records.forEach((r, i) => {
          const key = `k${String(i)}`;
          const got = named.info.get(key);
          const expected = expectedFor(s, r);
          if (expected === "unresolved") {
            expect(got?.status).not.toBe("verified");
            expect(got?.status).not.toBe("wrong_case");
          } else {
            expect(got).toEqual(expected);
          }
          // Without a name on the record the result is `verified` or the unchanged status (5.2, 5.3).
          const unnamed = bare.info.get(key);
          if (got?.status !== "verified" && got?.status !== "wrong_case") {
            expect(got).toEqual(unnamed);
          } else {
            expect(unnamed?.status).toBe("verified");
          }
        });
      }),
      { numRuns: runs() },
    );
  });
});

// ---- Property 10 harness: a second run on the same cache. ----

/** Only line kinds that are cached (200, 300, 400, 404); `unchecked` outcomes are never cached. */
const arbCachedScenario: fc.Arbitrary<Scenario> = arbScenario.map((s) => ({
  ...s,
  kinds: s.kinds.map((k): LineKind => (k === "429" || k === "junk" ? "200" : k)),
}));

/** Scripted answers for the chunks of `lines`, in the order `lookupWithInfo` requests them. */
function stepsFor(s: Scenario, lines: readonly string[]): ScriptStep[] {
  return chunkLines(lines).map((chunk) => ({
    status: 200,
    body: chunk.lines.map((line) => entryOf(s, Number.parseInt(line, 10) - 100)),
  }));
}

/** Fresh fetch and deps over the cache and clock of an earlier run. */
function sharedCacheDeps(first: TestDeps, steps: readonly ScriptStep[]): TestDeps {
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

async function firstRun(s: Scenario, records: CitationRecord[]): Promise<[TestDeps, LookupInfo]> {
  const lines = planLookup(records).lines;
  const first = makeDeps(stepsFor(s, lines));
  return [first, await lookupWithInfo(records, first.deps)];
}

// Feature: case-match, Property 10: a cache hit gives the live result
// Property 10
describe("Property 10: A cache hit gives the live result _Requirements: 5.7_", () => {
  it("returns the same results and info from the cache with no request, and refetches a verified entry without cluster data", async () => {
    await fc.assert(
      fc.asyncProperty(arbCachedScenario, fc.boolean(), async (s, withNames) => {
        const records = recordsOf(s, withNames);
        const [first, live] = await firstRun(s, records);
        const lines = planLookup(records).lines;

        // Second run on the same cache: identical output and no request.
        const hit = sharedCacheDeps(first, []);
        const cached = await lookupWithInfo(records, hit.deps);
        expect(cached.results).toEqual(live.results);
        expect(cached.info).toEqual(live.info);
        expect(hit.fetch.calls).toHaveLength(0);

        // Strip the cluster record from every cached `verified` entry: each is now a miss.
        const stripped = lines.filter((line) => {
          const r = lineOutcome(s, Number.parseInt(line, 10) - 100);
          return r.status === "verified";
        });
        for (const line of stripped) {
          const clusterId = String(s.clusterOf[Number.parseInt(line, 10) - 100] ?? 1);
          await cacheSet(first.deps, line, { status: "verified", clusterId });
        }
        const miss = sharedCacheDeps(first, stepsFor(s, stripped));
        const again = await lookupWithInfo(records, miss.deps);
        const requested = miss.fetch.calls.flatMap((c) => c.text.split("\n"));
        expect([...requested].sort()).toEqual([...stripped].sort());
        expect(again.results).toEqual(live.results);
        expect(again.info).toEqual(live.info);
      }),
      { numRuns: runs() },
    );
  });
});

// ---- Property 11 harness: the requests of a run over records with and without case names. ----

/** Every request of a run with a token configured, over fresh deps and the scenario's answers. */
async function requestsOf(
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

// Feature: case-match, Property 11: the lookup request carries no case name
// Property 11
describe("Property 11: The lookup request carries no case name _Requirements: 5.6, 15.7_", () => {
  it("sends the same requests with or without case names, and no case name appears outside a Citation_Line", async () => {
    await fc.assert(
      fc.asyncProperty(arbScenario, async (s) => {
        const named = recordsOf(s, true);
        const withNames = await requestsOf(s, named);
        const without = await requestsOf(s, recordsOf(s, false));

        expect(withNames.map((c) => c.body)).toEqual(without.map((c) => c.body));
        expect(withNames.map((c) => c.url)).toEqual(without.map((c) => c.url));
        expect(withNames.map((c) => c.headers)).toEqual(without.map((c) => c.headers));

        const lines = planLookup(named).lines.join("\n");
        const names = new Set(s.records.flatMap((r) => (r.cited === undefined ? [] : [r.cited])));
        for (const call of withNames) {
          const haystack = [call.url, call.body ?? "", call.text, ...Object.values(call.headers)];
          for (const name of names) {
            if (lines.includes(name)) continue;
            for (const part of haystack) expect(part).not.toContain(name);
            for (const part of haystack) expect(part).not.toContain(encodeURIComponent(name));
          }
        }
      }),
      { numRuns: runs() },
    );
  });
});

// ---- Property 12 harness: one record on one line, with generated `date_filed` and `absolute_url`. ----

const arbDigits4 = fc.stringMatching(/^[0-9]{4}$/);
/** `date_filed` values: digit heads (below, at and above 1000), digit-light heads and arbitrary text. */
const arbDateFiled: fc.Arbitrary<string> = fc.oneof(
  fc.tuple(arbDigits4, fc.constantFrom("", "-05-18", "x", "5")).map(([y, t]) => y + t),
  fc
    .tuple(fc.integer({ min: 0, max: 999 }), fc.constant("-01-01"))
    .map(([y, t]) => String(y).padStart(4, "0") + t),
  fc.stringMatching(/^[0-9]{0,3}[^0-9][0-9a-z-]{0,8}$/),
  fc.string({ maxLength: 12 }),
);
/** `absolute_url` values of every JSON shape; only a string with a single leading `/` is usable. */
const arbAbsoluteUrl: fc.Arbitrary<unknown> = fc.oneof(
  fc.constantFrom<unknown>(
    undefined,
    null,
    7,
    true,
    "",
    "/",
    "//",
    "//evil.example/x",
    "http://x/y",
    "opinion/1/x/",
  ),
  fc.string({ maxLength: 12 }).map((s) => `/${s}`),
  fc.string({ maxLength: 12 }).map((s) => `//${s}`),
  fc.string({ maxLength: 12 }),
);

type InfoCase = Readonly<{
  cited: string | undefined;
  found: string;
  dateFiled: string;
  absoluteUrl: unknown;
}>;

const arbInfoCase: fc.Arbitrary<InfoCase> = fc.record({
  cited: fc.oneof(fc.constant(undefined), arbPooledCaseName(POOL_A_M), arbPooledCaseName(POOL_N_Z)),
  found: arbPooledCaseName(POOL_A_M),
  dateFiled: arbDateFiled,
  absoluteUrl: arbAbsoluteUrl,
});

function infoRecord(cited: string | undefined): CitationRecord {
  const text = lineText(0);
  const caseName = cited === undefined ? {} : { caseName: cited };
  return {
    kind: "full",
    key: "k0",
    citation: {
      start: 0,
      end: text.length,
      text,
      value: { kind: "reporter", ...member(0) },
      ...caseName,
    },
    result: { status: "unchecked" },
  };
}

const expectedYear = (d: string): number | undefined => {
  const head = d.slice(0, 4);
  return /^[0-9]{4}$/.test(head) && Number(head) >= 1000 ? Number(head) : undefined;
};
const expectedUrl = (u: unknown): string | undefined =>
  typeof u === "string" && u.startsWith("/") && !u.startsWith("//") ? u : undefined;

// Feature: case-match, Property 12: Display_Info derivation
// Property 12
describe("Property 12: Display_Info derivation _Requirements: 5.8, 5.9_", () => {
  it("sets foundYear iff date_filed starts with four digits worth at least 1000, and absoluteUrl iff it is a string with a single leading slash", async () => {
    await fc.assert(
      fc.asyncProperty(arbInfoCase, async (c) => {
        const entry = {
          status: 200,
          clusters: [
            {
              id: 1,
              case_name: c.found,
              date_filed: c.dateFiled,
              ...(c.absoluteUrl === undefined ? {} : { absolute_url: c.absoluteUrl }),
            },
          ],
        };
        const run = makeDeps([{ status: 200, body: [entry] }]);
        const out = await lookupWithInfo([infoRecord(c.cited)], run.deps);
        const info = out.info.get("k0");
        const result = out.results.get("k0");
        const year = expectedYear(c.dateFiled);
        const url = expectedUrl(c.absoluteUrl);

        expect(info?.foundName).toBe(c.found);
        expect(info?.clusterId).toBe("1");
        expect(info?.foundYear).toBe(year);
        expect("foundYear" in (info ?? {})).toBe(year !== undefined);
        expect(info?.absoluteUrl).toBe(url);
        expect("absoluteUrl" in (info ?? {})).toBe(url !== undefined);
        if (result?.status === "wrong_case") {
          expect(result.foundYear).toBe(year);
          expect("foundYear" in result).toBe(year !== undefined);
        } else {
          expect(result?.status).toBe("verified");
        }
      }),
      { numRuns: runs() },
    );
  });
});

// ---- Property 13 harness: cluster ids of digits and near-digits, and absolute URLs of every shape. ----

const ORIGIN = "https://www.courtlistener.com";
const arbDigitId = fc.stringMatching(/^[0-9]{1,12}$/);
/** Strings that look like ids but are not ASCII digits only: empty, signs, spaces, newlines, non-ASCII digits. */
const arbNonDigitId: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom(
    "",
    " ",
    "-1",
    "+1",
    "1.5",
    "1e3",
    "١٢٣",
    "１２３",
    "12\n",
    "\n12",
    "1 2",
    "0x1f",
  ),
  fc.tuple(arbDigitId, fc.constantFrom("a", " ", "\n", "/", "-", "١")).map(([d, x]) => d + x),
  fc.tuple(fc.constantFrom("a", " ", "\n", "/", "-", "١"), arbDigitId).map(([x, d]) => x + d),
  fc.string({ maxLength: 10 }).filter((s) => !/^[0-9]+$/.test(s)),
);
const arbLinkId: fc.Arbitrary<string> = fc.oneof(arbDigitId, arbNonDigitId);
/** Site-relative paths (one leading slash), protocol-relative and absolute URLs, other strings, and undefined. */
const arbLinkUrl: fc.Arbitrary<string | undefined> = fc.oneof(
  fc.constantFrom<string | undefined>(
    undefined,
    "",
    "/",
    "//",
    "//evil.example/x",
    "http://evil.example/x",
    "https://evil.example/",
    "opinion/1/x/",
    "\\\\evil.example",
  ),
  fc.string({ maxLength: 16 }).map((s) => `/${s}`),
  fc.string({ maxLength: 16 }).map((s) => `//${s}`),
  fc.string({ maxLength: 16 }),
);

// Feature: case-match, Property 13: CourtListener link construction
// Property 13
describe("Property 13: CourtListener link construction _Requirements: 7.4_", () => {
  it("is null iff the cluster id is not ASCII digits, else the fixed origin plus a single-slash path or the opinion path", () => {
    fc.assert(
      fc.property(arbLinkId, arbLinkUrl, (clusterId, absoluteUrl) => {
        const link = courtListenerLink(clusterId, absoluteUrl);
        if (!/^[0-9]+$/.test(clusterId)) {
          expect(link).toBeNull();
          return;
        }
        const usable =
          absoluteUrl !== undefined && absoluteUrl.startsWith("/") && !absoluteUrl.startsWith("//");
        expect(link).toBe(usable ? `${ORIGIN}${absoluteUrl}` : `${ORIGIN}/opinion/${clusterId}/x/`);
        expect(link?.startsWith(`${ORIGIN}/`)).toBe(true);
        // The host is the constant origin whatever the response held.
        expect(new URL(link ?? "").origin).toBe(ORIGIN);
      }),
      { numRuns: runs() },
    );
  });
});
