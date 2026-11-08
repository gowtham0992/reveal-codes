import * as fc from "fast-check";
import { format } from "@reveal-codes/engine";
import type { CitationRecord, IssueKey, VerificationResult } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { buildLookupRequest } from "../src/request";
import type { LookupRequest } from "../src/request";
import { planLookup, resultsForRecords } from "../src/lookup";
import { arbDatabaseCase } from "./support/arb-db-records";
import { arbMixedCase } from "./support/arb-mixed-records";
import { arbLookupCase } from "./support/arb-records";
import type { LookupCase } from "./support/arb-records";
import { runs } from "./support/fc";
import { TEST_BASE_URL } from "./support/make-deps";

// ---- Harness: the only place that knows how requests are obtained. ----
// Until task 4.4 the requests come from `planLookup` and `request.ts`; task 4.4
// replaces this one function with `lookup()` over a scripted fetch of 404 entries.
function requestsFor(c: LookupCase): readonly LookupRequest[] {
  const deps =
    c.token === undefined ? { baseUrl: TEST_BASE_URL } : { baseUrl: TEST_BASE_URL, token: c.token };
  return planLookup(c.records)
    .chunks.filter((chunk) => !chunk.oversize)
    .map((chunk) => buildLookupRequest(deps, chunk.lines));
}

// ---- Oracle: the expected Citation_Lines, derived without lines.ts. ----
function memberLines(rec: CitationRecord): string[] {
  if (rec.kind !== "full") return [];
  const v = rec.citation.value;
  const members = v.kind === "reporter" ? [v] : v.kind === "parallel" ? v.members : [];
  return members.flatMap((m) => {
    const r = format({ kind: "reporter", volume: m.volume, reporter: m.reporter, page: m.page });
    return r.ok ? [r.value] : [];
  });
}

function expectedLines(records: readonly CitationRecord[]): string[] {
  return [...new Set(records.flatMap(memberLines))];
}

function decodedText(body: string | undefined): string {
  expect(body?.startsWith("text=")).toBe(true);
  return decodeURIComponent((body ?? "").slice("text=".length));
}

const ALLOWED_HEADERS = ["Accept", "Authorization", "Content-Type"];

// Property 2
// Feature: citation-verifier, Property 2: Request bodies carry only Citation_Lines drawn from the records
describe("Property 2: request bodies _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.8_", () => {
  it("every request body is Citation_Lines from the records and nothing else", () => {
    fc.assert(
      fc.property(arbLookupCase, (c) => {
        const expected = expectedLines(c.records);
        const reqs = requestsFor(c);
        // Prefix-ordered slices: the bodies, in order, rebuild the unique lines.
        const sent = reqs.flatMap((r) => {
          const text = decodedText(r.spec.body);
          expect(text.startsWith("\n") || text.endsWith("\n")).toBe(false);
          return text === "" ? [] : text.split("\n");
        });
        expect(sent).toEqual(expected.filter((l) => l.length <= 64_000));
        const allowedText = expected.join("\n");
        for (const r of reqs) {
          expect(r.url).toBe(`${TEST_BASE_URL}/citation-lookup/`);
          expect(r.spec.method).toBe("POST");
          for (const h of Object.keys(r.spec.headers)) expect(ALLOWED_HEADERS).toContain(h);
          expect("Authorization" in r.spec.headers).toBe(c.token !== undefined);
          // The draft appears in a request only if it is a substring of the allowed lines.
          const text = decodedText(r.spec.body);
          if (c.draft !== "" && !allowedText.includes(c.draft)) {
            expect(text.includes(c.draft)).toBe(false);
          }
          // Nothing but the form field travels: no query string, no extra field.
          expect(r.url.includes("?")).toBe(false);
          expect((r.spec.body ?? "").includes("&")).toBe(false);
        }
      }),
      { numRuns: runs() },
    );
  });
});

// Stub until task 4.4 wires `lookup()`: every sent line "resolves", so a database
// record could only come out unchecked by being routed around the line map.
function stubResults(c: LookupCase): ReadonlyMap<IssueKey, VerificationResult> {
  const plan = planLookup(c.records);
  const lineResults = new Map<string, VerificationResult>(
    plan.lines.map((l) => [l, { status: "verified", clusterId: "1" }]),
  );
  return resultsForRecords(plan.index, lineResults, () => ({ status: "verified", clusterId: "1" }));
}

// Property 11
// Feature: citation-verifier, Property 11: Database citations are never sent and always map to unchecked
describe("Property 11: database citations _Requirements: 5.1, 5.3, 5.4, 5.5_", () => {
  it("are never sent, map to bare unchecked, and do not change the other lines", () => {
    fc.assert(
      fc.property(arbDatabaseCase, (c) => {
        const reqs = requestsFor(c.mixed);
        for (const r of reqs) {
          const text = decodedText(r.spec.body);
          for (const db of c.databaseTexts) expect(text.includes(db)).toBe(false);
        }
        const results = stubResults(c.mixed);
        for (const key of c.databaseKeys) {
          const result = results.get(key);
          expect(result).toEqual({ status: "unchecked" });
          expect(result !== undefined && "waitUntil" in result).toBe(false);
        }
        const bodies = (rs: readonly LookupRequest[]): (string | undefined)[] =>
          rs.map((r) => r.spec.body);
        expect(bodies(reqs)).toEqual(bodies(requestsFor(c.withoutDatabase)));
        if (c.onlyDatabase) expect(reqs).toHaveLength(0);
      }),
      { numRuns: runs() },
    );
  });
});

// Stub until task 4.4: results that depend on the line, so equal lines must give equal
// results and different lines usually do not. The combine stub depends on its members only.
function stubLineResult(line: string): VerificationResult {
  const n = line.length % 3;
  if (n === 0) return { status: "verified", clusterId: line };
  if (n === 1) return { status: "not_found" };
  return { status: "ambiguous", candidates: [line, `${line}!`] };
}

function variedResults(c: LookupCase): ReadonlyMap<IssueKey, VerificationResult> {
  const plan = planLookup(c.records);
  const lineResults = new Map(plan.lines.map((l) => [l, stubLineResult(l)] as const));
  return resultsForRecords(plan.index, lineResults, (members) => ({
    status: "ambiguous",
    candidates: members.map((m) => JSON.stringify(m)),
  }));
}

// Property 12
// Feature: citation-verifier, Property 12: Short and other records are never sent and never in the result map
describe("Property 12: short and other records _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6_", () => {
  it("are never sent, never keyed, and equal Citation_Lines get equal results", () => {
    fc.assert(
      fc.property(arbMixedCase, (m) => {
        const c = m.lookup;
        const expected = new Set(expectedLines(c.records));
        const allowedText = [...expected].join("\n");
        const sent = requestsFor(c).flatMap((r) => decodedText(r.spec.body).split("\n"));
        for (const line of sent) {
          if (line !== "" && !expected.has(line)) expect(m.derivedTexts).not.toContain(line);
        }
        for (const d of m.derivedTexts) {
          if (d !== "" && !allowedText.includes(d)) {
            for (const r of requestsFor(c))
              expect(decodedText(r.spec.body).includes(d)).toBe(false);
          }
        }
        const fullKeys = c.records.flatMap((r) => (r.kind === "full" ? [r.key] : []));
        const results = variedResults(c);
        expect(new Set(fullKeys).size).toBe(fullKeys.length);
        expect(results.size).toBe(fullKeys.length);
        expect([...results.keys()].sort()).toEqual([...fullKeys].sort());
        for (const key of m.shortKeys) expect(results.has(key)).toBe(false);
        // Req 1.6: equal Citation_Lines, equal results.
        const byLines = new Map<string, VerificationResult>();
        const plan = planLookup(c.records);
        for (const [key, members] of plan.index.members) {
          if (typeof members === "string") continue;
          const result = results.get(key);
          expect(result).toBeDefined();
          const id = members.join("\n");
          const seen = byLines.get(id);
          if (seen !== undefined) expect(result).toEqual(seen);
          else if (result !== undefined) byLines.set(id, result);
        }
      }),
      { numRuns: runs() },
    );
  });
});
