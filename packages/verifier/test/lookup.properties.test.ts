import * as fc from "fast-check";
import { format } from "@reveal-codes/engine";
import type { CitationRecord, IssueKey, VerificationResult } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { lookup, planLookup } from "../src/lookup";
import { arbDatabaseCase } from "./support/arb-db-records";
import { arbMixedCase } from "./support/arb-mixed-records";
import { arbLookupCase } from "./support/arb-records";
import type { LookupCase } from "./support/arb-records";
import { runs } from "./support/fc";
import { makeDeps, TEST_BASE_URL } from "./support/make-deps";
import type { RecordedCall } from "./support/scripted-fetch";
import type { ScriptStep } from "./support/scripted-fetch";

// ---- Harness: the only place that knows how requests and results are obtained. ----
// `lookup()` runs over a scripted fetch that answers every chunk with one entry per
// line (position-mapped). Requests are read from the fetch's recorded calls.
type EntryFor = (line: string) => unknown;

const notFoundEntry: EntryFor = () => ({ status: 404, clusters: [] });

function scriptFor(c: LookupCase, entryFor: EntryFor): readonly ScriptStep[] {
  return planLookup(c.records)
    .chunks.filter((chunk) => !chunk.oversize)
    .map((chunk) => ({ status: 200, body: chunk.lines.map(entryFor) }));
}

type Run = Readonly<{
  requests: readonly RecordedCall[];
  results: ReadonlyMap<IssueKey, VerificationResult>;
}>;

async function runLookup(c: LookupCase, entryFor: EntryFor = notFoundEntry): Promise<Run> {
  const opts = c.token === undefined ? {} : { token: c.token };
  const t = makeDeps(scriptFor(c, entryFor), opts);
  const results = await lookup(c.records, t.deps);
  return { requests: t.fetch.calls, results };
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
  it("every request body is Citation_Lines from the records and nothing else", async () => {
    await fc.assert(
      fc.asyncProperty(arbLookupCase, async (c) => {
        const expected = expectedLines(c.records);
        const { requests: reqs } = await runLookup(c);
        // Prefix-ordered slices: the bodies, in order, rebuild the unique lines.
        const sent = reqs.flatMap((r) => {
          const text = decodedText(r.body);
          expect(text.startsWith("\n") || text.endsWith("\n")).toBe(false);
          return text === "" ? [] : text.split("\n");
        });
        expect(sent).toEqual(expected.filter((l) => l.length <= 64_000));
        const allowedText = expected.join("\n");
        for (const r of reqs) {
          expect(r.url).toBe(`${TEST_BASE_URL}/citation-lookup/`);
          expect(r.method).toBe("POST");
          for (const h of Object.keys(r.headers)) expect(ALLOWED_HEADERS).toContain(h);
          expect("Authorization" in r.headers).toBe(c.token !== undefined);
          // The draft appears in a request only if it is a substring of the allowed lines.
          const text = decodedText(r.body);
          if (c.draft !== "" && !allowedText.includes(c.draft)) {
            expect(text.includes(c.draft)).toBe(false);
          }
          // Nothing but the form field travels: no query string, no extra field.
          expect(r.url.includes("?")).toBe(false);
          expect((r.body ?? "").includes("&")).toBe(false);
        }
      }),
      { numRuns: runs() },
    );
  });
});

// Property 11
// Feature: citation-verifier, Property 11: Database citations are never sent and always map to unchecked
describe("Property 11: database citations _Requirements: 5.1, 5.3, 5.4, 5.5_", () => {
  it("are never sent, map to bare unchecked, and do not change the other lines", async () => {
    await fc.assert(
      fc.asyncProperty(arbDatabaseCase, async (c) => {
        // Every sent line "resolves", so a database record could only come out
        // unchecked by being routed around the line map.
        const resolving: EntryFor = () => ({ status: 200, clusters: [{ id: 1 }] });
        const { requests: reqs, results } = await runLookup(c.mixed, resolving);
        for (const r of reqs) {
          const text = decodedText(r.body);
          for (const db of c.databaseTexts) expect(text.includes(db)).toBe(false);
        }
        for (const key of c.databaseKeys) {
          const result = results.get(key);
          expect(result).toEqual({ status: "unchecked" });
          expect(result !== undefined && "waitUntil" in result).toBe(false);
        }
        const without = await runLookup(c.withoutDatabase, resolving);
        const bodies = (rs: readonly RecordedCall[]): (string | undefined)[] =>
          rs.map((r) => r.body);
        expect(bodies(reqs)).toEqual(bodies(without.requests));
        if (c.onlyDatabase) expect(reqs).toHaveLength(0);
      }),
      { numRuns: runs() },
    );
  });
});

// Line-dependent responses, so equal lines must give equal results and different
// lines usually do not.
function variedEntry(line: string): unknown {
  const n = line.length % 3;
  if (n === 0) return { status: 200, clusters: [{ id: line.length + 1 }] };
  if (n === 1) return { status: 404, clusters: [] };
  return { status: 300, clusters: [{ id: line.length + 1 }, { id: line.length + 2 }] };
}

// Property 12
// Feature: citation-verifier, Property 12: Short and other records are never sent and never in the result map
describe("Property 12: short and other records _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6_", () => {
  it("are never sent, never keyed, and equal Citation_Lines get equal results", async () => {
    await fc.assert(
      fc.asyncProperty(arbMixedCase, async (m) => {
        const c = m.lookup;
        const expected = new Set(expectedLines(c.records));
        const allowedText = [...expected].join("\n");
        const { requests, results } = await runLookup(c, variedEntry);
        const sent = requests.flatMap((r) => decodedText(r.body).split("\n"));
        for (const line of sent) {
          if (line !== "" && !expected.has(line)) expect(m.derivedTexts).not.toContain(line);
        }
        for (const d of m.derivedTexts) {
          if (d !== "" && !allowedText.includes(d)) {
            for (const r of requests) expect(decodedText(r.body).includes(d)).toBe(false);
          }
        }
        const fullKeys = c.records.flatMap((r) => (r.kind === "full" ? [r.key] : []));
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
