import type {
  Document,
  IssueKey,
  QuoteCheckResult,
  VerificationResult,
} from "@reveal-codes/engine";
import type { FetchInit, FetchLike, HttpResponse } from "@reveal-codes/verifier";
import { describe, expect, it } from "vitest";
import { reverify } from "../src/reverify.js";
import { buildDemoDocument } from "./support/export-support.js";
import { recordedFetch, throttleFetch } from "./support/recorded-fetch.js";
import { testDeps } from "./support/test-deps.js";

type Probe = Readonly<{
  fetch: FetchLike;
  posts: () => number;
  gets: () => readonly string[];
  maxActive: () => number;
}>;

/** Wraps a fetch to count lookups, list opinion requests in start order and track overlap. */
function probe(inner: FetchLike): Probe {
  let posts = 0;
  let active = 0;
  let max = 0;
  const gets: string[] = [];
  const fetch: FetchLike = async (url: string, init: FetchInit) => {
    if (init.method === "POST") posts += 1;
    else gets.push(url);
    active += 1;
    max = Math.max(max, active);
    try {
      return await inner(url, init);
    } finally {
      active -= 1;
    }
  };
  return { fetch, posts: () => posts, gets: () => gets, maxActive: () => max };
}

function verificationOf(doc: Document): readonly [IssueKey, VerificationResult][] {
  return doc.citations.flatMap((c) => (c.kind === "full" ? [[c.key, c.result] as const] : []));
}

function quoteResultsOf(doc: Document): readonly [IssueKey, QuoteCheckResult][] {
  return doc.quotes.map((q) => [q.key, q.result] as const);
}

describe("reverify", () => {
  it("leaves a document whose records still hold unchanged, with nothing unavailable", async () => {
    const doc = await buildDemoDocument();
    const outcome = await reverify(doc, testDeps(recordedFetch().fetch));
    expect(outcome.document.text).toBe(doc.text);
    expect(verificationOf(outcome.document)).toEqual(verificationOf(doc));
    expect(quoteResultsOf(outcome.document)).toEqual(quoteResultsOf(doc));
    expect(outcome.unavailable).toBeNull();
    expect(outcome.notRechecked).toEqual([]);
  });

  it("calls lookup once for all citations", async () => {
    const doc = await buildDemoDocument();
    const p = probe(recordedFetch().fetch);
    await reverify(doc, testDeps(p.fetch));
    expect(p.posts()).toBe(1);
  });

  it("fetches each cluster once, in first-encounter order, never concurrently", async () => {
    const doc = await buildDemoDocument();
    const p = probe(recordedFetch().fetch);
    await reverify(doc, testDeps(p.fetch));
    // One /clusters/<id>/ request starts each cluster's opinion fetch.
    const clusters = p.gets().filter((u) => u.includes("/clusters/"));
    expect(clusters).toHaveLength(2);
    expect(clusters[0]).toContain("/clusters/108432/");
    expect(clusters[1]).toContain("/clusters/145875/");
    expect(p.maxActive()).toBe(1);
  });

  it("keeps Recorded_Status and reports the throttle's waitUntil when every request is throttled", async () => {
    const doc = await buildDemoDocument();
    const outcome = await reverify(doc, testDeps(throttleFetch()));
    expect(verificationOf(outcome.document)).toEqual(verificationOf(doc));
    expect(quoteResultsOf(outcome.document)).toEqual(quoteResultsOf(doc));
    expect(outcome.unavailable).toEqual({ waitUntil: "2026-11-02T12:00:30.000Z" });
  });

  it("reports an unavailable opinion without a waitUntil and leaves its quotes in place", async () => {
    const doc = await buildDemoDocument();
    const recorded = recordedFetch();
    const failing: HttpResponse = {
      status: 500,
      headers: { get: () => null },
      text: () => Promise.resolve("{}"),
    };
    const fetch: FetchLike = (url, init) =>
      init.method === "POST" ? recorded.fetch(url, init) : Promise.resolve(failing);
    const outcome = await reverify(doc, testDeps(fetch));
    expect(outcome.unavailable).toEqual({ waitUntil: null });
    expect(verificationOf(outcome.document)).toEqual(verificationOf(doc));
    expect(quoteResultsOf(outcome.document)).toEqual(quoteResultsOf(doc));
  });

  it("applies a changed answer and drops the override it no longer fits, without touching the input", async () => {
    const doc = await buildDemoDocument();
    const target = doc.citations.find((c) => c.kind === "full" && c.result.status === "not_found");
    expect(target?.kind).toBe("full");
    if (target?.kind !== "full") return;
    // The record says "verified", the recorded data says "not found": the lookup disagrees.
    const edited: Document = {
      ...doc,
      citations: doc.citations.map((c) =>
        c === target ? { ...c, result: { status: "verified", clusterId: "1" } } : c,
      ),
    };
    const before = structuredClone(edited);
    const outcome = await reverify(edited, testDeps(recordedFetch().fetch));
    expect(edited).toEqual(before);
    const after = outcome.document.citations.find((c) => c.kind === "full" && c.key === target.key);
    expect(after?.kind === "full" ? after.result.status : null).toBe("not_found");
    expect(outcome.document.text).toBe(edited.text);
    expect(outcome.notRechecked).toEqual([]);
  });
});
