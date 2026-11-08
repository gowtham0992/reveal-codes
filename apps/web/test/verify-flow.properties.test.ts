import * as fc from "fast-check";
import type { Document } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { createApiClient } from "../src/client/api";
import type { FetchFn, FullRecord } from "../src/client/api";
import { runVerifyFlow } from "../src/client/verify-flow";
import { createStore } from "../src/store-runtime";
import { CLUSTER_POOL, arbCitingDocument, arbVerifyScript } from "./arbitraries";
import type { VerifyScript } from "./arbitraries";
import { runs } from "./support/fc";
import type { RecordedRequest } from "./support/route-fetch";

const ISO = "2024-01-01T00:00:00.000Z";
const WINDOW = 20;

const json = (value: unknown): Response => new Response(JSON.stringify(value), { status: 200 });

function opinionText(script: VerifyScript, doc: Document, id: string): string | null {
  const text = script.opinions[CLUSTER_POOL.indexOf(id)] ?? null;
  if (text === null || !script.embedQuotes) return text;
  return [text, ...doc.quotes.map((q) => `"${q.quote.text}"`)].join(" ");
}

/** A fake server over `script` that records every request. */
function recordingFetch(script: VerifyScript, doc: Document) {
  const requests: RecordedRequest[] = [];
  const fetchFn: FetchFn = (url, init) => {
    requests.push({ url, method: init?.method ?? "GET", body: init?.body ?? null });
    if (url === "/api/verify") {
      const sent = JSON.parse(init?.body ?? "{}") as { records?: FullRecord[] };
      const results = script.results;
      const pairs = (sent.records ?? []).map((r, i) => [r.key, results[i % results.length]]);
      return Promise.resolve(json(pairs));
    }
    const id = /^\/api\/opinion\/(\d+)$/.exec(url)?.[1] ?? "";
    return Promise.resolve(json({ clusterId: id, text: opinionText(script, doc, id) }));
  };
  return { fetchFn, requests };
}

function fullsOf(doc: Document): readonly FullRecord[] {
  return doc.citations.filter((c): c is FullRecord => c.kind === "full");
}

/** Cluster ids by first encounter, computed from a Document without the code under test. */
function expectedClusters(doc: Document): readonly string[] {
  const ids: string[] = [];
  for (const q of doc.quotes) {
    const owner = doc.citations.find((c) => c.citation.start === q.quote.citationStart);
    const value = owner?.citation.value;
    const targetStart =
      owner?.kind === "short" && value?.kind === "short"
        ? value.targetStart
        : owner?.citation.start;
    const target = doc.citations.find((c) => c.citation.start === targetStart);
    const cluster =
      target?.kind === "full" && target.result.status === "verified"
        ? target.result.clusterId
        : null;
    if (cluster !== null && !ids.includes(cluster)) ids.push(cluster);
  }
  return ids;
}

/** Windows of `doc.text` lying wholly outside every Full_Record range and not inside a record's text. */
function outsideWindows(doc: Document): readonly string[] {
  const fulls = fullsOf(doc);
  const out: string[] = [];
  for (let i = 0; i + WINDOW <= doc.text.length; i++) {
    const clear = fulls.every((f) => i + WINDOW <= f.citation.start || i >= f.citation.end);
    const w = doc.text.slice(i, i + WINDOW);
    const own = (f: FullRecord): boolean =>
      f.citation.text.includes(w) || (f.citation.normalised ?? "").includes(w);
    if (clear && !fulls.some(own)) out.push(w);
  }
  return out;
}

function leaks(body: string, windows: readonly string[]): readonly string[] {
  return windows.filter((w) => body.includes(w) || body.includes(JSON.stringify(w).slice(1, -1)));
}

function checkPost(doc: Document, requests: readonly RecordedRequest[]): void {
  const posts = requests.filter((r) => r.method === "POST");
  expect(posts).toHaveLength(1);
  expect(requests[0]).toBe(posts[0]);
  const body = posts[0]?.body ?? "";
  const parsed = JSON.parse(body) as Record<string, unknown>;
  expect(Object.keys(parsed)).toEqual(["records"]);
  expect(parsed["records"]).toEqual(fullsOf(doc));
  expect(leaks(body, outsideWindows(doc))).toEqual([]);
  for (const q of doc.quotes) {
    if (q.quote.text.length >= WINDOW) expect(body).not.toContain(q.quote.text);
  }
}

function checkGets(doc: Document, final: Document, requests: readonly RecordedRequest[]): void {
  const gets = requests.slice(1);
  expect(gets.every((r) => r.method === "GET" && r.body === null)).toBe(true);
  expect(gets.every((r) => /^\/api\/opinion\/\d+$/.test(r.url))).toBe(true);
  expect(gets.map((r) => r.url.slice("/api/opinion/".length))).toEqual(expectedClusters(final));
  for (const r of gets) {
    const id = decodeURIComponent(r.url.slice("/api/opinion/".length));
    for (const q of doc.quotes) expect(id).not.toContain(q.quote.text);
  }
}

const CLOCK = (): Date => new Date(ISO);

describe("Property 5: only citations leave _Requirements: 17.14_", () => {
  // Property 5
  it("sends one POST of the Full_Records, then only cluster-id GETs for verified quotes", async () => {
    await fc.assert(
      fc.asyncProperty(arbCitingDocument, arbVerifyScript, async (doc, script) => {
        const store = createStore(() => new Date(ISO));
        store.dispatch({ type: "replace", document: doc });
        const start = store.getState().document;
        const { fetchFn, requests } = recordingFetch(script, start);
        const outcome = await runVerifyFlow(createApiClient(fetchFn), store, CLOCK);
        expect(outcome.status).toBe("completed");
        checkPost(start, requests);
        checkGets(start, store.getState().document, requests);
      }),
      { numRuns: runs() },
    );
  });
});
