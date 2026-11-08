import * as fc from "fast-check";
import { format } from "@reveal-codes/engine";
import type { CitationRecord } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { buildLookupRequest } from "../src/request";
import type { LookupRequest } from "../src/request";
import { planLookup } from "../src/lookup";
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
