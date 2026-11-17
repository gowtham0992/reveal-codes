import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { docxSafe } from "@reveal-codes/export";
import { arbProseWords } from "../../../packages/engine/src/testing/arb-quote-parts";
import { arbTextWithCitations } from "../../../packages/engine/src/testing/arb-text-citations";
import { createApiClient } from "../src/client/api";
import type { FetchFn } from "../src/client/api";
import { pastedDocument } from "../src/client/pasted-document";
import { buildVerifyBody, hasFullRecord } from "../src/client/verify-flow";
import { runCheck } from "../src/check/run-check";
import { MAX_TEXT_CHARS } from "../src/limits";
import { runs } from "./support/fc";

const MARKER = "ZQXMARKERZQX";
const NOW = new Date("2026-11-20T12:00:00.000Z");
const OPINION = "The court held that the motion is denied.";

type Sent = Readonly<{ url: string; method: string; body: string | undefined }>;

/** Recording fetch: answers verify with one verified cluster per record, opinions with fixed text. */
function recorder(): Readonly<{ fetch: FetchFn; sent: Sent[]; clusters: Set<string> }> {
  const sent: Sent[] = [];
  const clusters = new Set<string>();
  const json = (value: unknown): Response => new Response(JSON.stringify(value), { status: 200 });
  const fetchFn: FetchFn = (url, init) => {
    sent.push({ url, method: init?.method ?? "GET", body: init?.body });
    if (url === "/api/verify") {
      const body = JSON.parse(init?.body ?? "{}") as { records: { key: string }[] };
      const results = body.records.map((r, i): [string, unknown] => {
        const clusterId = `c${String(i)}`;
        clusters.add(clusterId);
        return [r.key, { status: "verified", clusterId }];
      });
      return Promise.resolve(json({ results, info: [] }));
    }
    if (url.startsWith("/api/opinion/")) return Promise.resolve(json({ text: OPINION }));
    return Promise.resolve(new Response("", { status: 404 }));
  };
  return { fetch: fetchFn, sent, clusters };
}

const arbDraft: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom("", "   ", "\n\t "),
  fc.constant("a".repeat(MAX_TEXT_CHARS + 1)),
  arbProseWords,
  arbTextWithCitations.map((t) => `${t.text}\n\n${MARKER} trailing prose.`),
);

const ALLOWED = (url: string): boolean =>
  url === "/api/verify" ||
  url === "/api/mode" ||
  url === "/avianca-citations.txt" ||
  url.startsWith("/api/opinion/");

describe("check page request surface  _Requirements: 11.3, 11.4_", () => {
  // Property 2: nothing more is sent
  it("P2 only the verify body and cluster-id GETs leave the page", async () => {
    await fc.assert(
      fc.asyncProperty(arbDraft, async (text) => {
        const rec = recorder();
        await runCheck({ text, api: createApiClient(rec.fetch), now: () => NOW });
        for (const s of rec.sent) expect(ALLOWED(s.url)).toBe(true);

        const safe = docxSafe(text).text;
        const refused = safe.length > MAX_TEXT_CHARS || /^\s*$/.test(safe);
        const built = refused ? "refused" : pastedDocument(safe, NOW.toISOString());
        if (typeof built === "string" || !hasFullRecord(built)) {
          expect(rec.sent).toEqual([]);
          return;
        }
        const verifies = rec.sent.filter((s) => s.url === "/api/verify");
        expect(verifies).toHaveLength(1);
        expect(verifies[0]?.method).toBe("POST");
        expect(verifies[0]?.body).toBe(JSON.stringify(buildVerifyBody(built)));
        for (const s of rec.sent) {
          expect(s.body ?? "").not.toContain(MARKER);
          expect(s.url).not.toContain(MARKER);
          if (s.url.startsWith("/api/opinion/")) {
            expect(s.method).toBe("GET");
            expect(s.body).toBeUndefined();
            expect(rec.clusters.has(decodeURIComponent(s.url.slice("/api/opinion/".length)))).toBe(
              true,
            );
          }
        }
        expect(rec.sent.length).toBe(1 + rec.sent.filter((s) => s.url !== "/api/verify").length);
      }),
      { numRuns: runs() },
    );
  });
});
