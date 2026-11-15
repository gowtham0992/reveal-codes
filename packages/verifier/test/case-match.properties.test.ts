// Properties of the case-match spec for the verifier. Other verifier property
// tasks (9, 10, 11, 12, 13, 18) append their describe blocks to this file.
// Harnesses and arbitraries live in ./support/case-match-*.ts.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  POOL_A_M,
  arbDisjointNames,
  arbNameVariant,
  arbPooledCaseName,
} from "../../engine/src/testing/arb-case-match";
import { cacheSet } from "../src/cache-access";
import { lookupWithInfo, planLookup } from "../src/lookup";
import { courtListenerLink } from "../src/link";
import { namesMatch } from "../src/name-match";
import {
  arbCachedScenario,
  arbScenario,
  expectedFor,
  firstRun,
  lineOutcome,
  recordsOf,
  requestsOf,
  runBoth,
  sharedCacheDeps,
  stepsFor,
} from "./support/case-match-scenario";
import { arbInfoCase, expectedUrl, expectedYear, infoRecord } from "./support/case-match-info";
import { ORIGIN, arbLinkId, arbLinkUrl } from "./support/case-match-link";
import { arbRecordingCase, expectedClusters, recordWith } from "./support/case-match-recording";
import { RECORD_LINES } from "../scripts/record-lookups";
import { runs } from "./support/fc";
import { makeDeps } from "./support/make-deps";
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

// Feature: case-match, Property 18: recorded fixtures carry no credentials
// Property 18
describe("Property 18: Recorded fixtures carry no credentials _Requirements: 11.2, 11.5, 11.11_", () => {
  it("writes neither the token nor any header name or value, and keeps exactly the identifying cluster fields", async () => {
    await fc.assert(
      fc.asyncProperty(arbRecordingCase, async (c0) => {
        const run = await recordWith(c0);
        expect(run.code).toBe(0);
        // The token did reach the request, so the absence below is not vacuous.
        expect(run.sent).toBe(`Token ${c0.token}`);
        expect(run.written.size).toBe(6);
        const expected = expectedClusters(c0);
        for (const text of [...run.written.values(), ...run.logs]) {
          expect(text).not.toContain(c0.token);
          expect(text.toLowerCase()).not.toContain("authorization");
          expect(text.toLowerCase()).not.toContain(c0.headerName);
        }
        for (const [slug, text] of run.written) {
          const fixture: unknown = JSON.parse(text);
          const line = RECORD_LINES.find(
            (l) => l.toLowerCase().replace(/[^a-z0-9]+/g, "") === slug.replace(/-/g, ""),
          );
          const entry = (fixture as { entry: { clusters: unknown[] } }).entry;
          const want = line === undefined ? undefined : expected.get(line);
          expect(entry.clusters).toEqual(want === undefined ? [] : [want]);
        }
      }),
      { numRuns: runs() },
    );
  });
});
