import * as fc from "fast-check";
import { issues, segment } from "@reveal-codes/engine";
import type { Document, Origin } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { buildStatement } from "../src/index.js";
import type { Statement } from "../src/index.js";
import { arbExportCase, runs } from "./support/arbitraries.js";
import type { ExportCase } from "./support/arbitraries.js";

const ORIGINS: readonly Origin[] = ["HUM", "PST", "AI", "AI>HUM"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local YYYY-MM-DD computed from the date getters, independently of the package. */
function expectedDate(d: Date): string {
  return [String(d.getFullYear()), pad(d.getMonth() + 1), pad(d.getDate())].join("-");
}

function tally(origins: readonly Origin[]): Record<Origin, number> {
  const out: Record<Origin, number> = { HUM: 0, PST: 0, AI: 0, "AI>HUM": 0 };
  for (const o of origins) out[o] += 1;
  return out;
}

function expectedCharacters(doc: Document): Record<Origin, number> {
  const out: Record<Origin, number> = { HUM: 0, PST: 0, AI: 0, "AI>HUM": 0 };
  for (const s of doc.spans) out[s.provenance.origin] += s.end - s.start;
  return out;
}

function expectedTools(c: ExportCase): readonly string[] {
  const used = new Set(c.document.runs.map((r) => r.runId));
  const keys = c.runLog
    .filter((e) => used.has(e.runId))
    .map((e) => JSON.stringify([e.provider, e.modelId]));
  return keys.filter((k, i) => keys.indexOf(k) === i);
}

function checkCounts(c: ExportCase, s: Statement): void {
  const doc = c.document;
  const chars = expectedCharacters(doc);
  expect(s.characters).toEqual(chars);
  const sum = ORIGINS.reduce((acc, o) => acc + s.characters[o], 0);
  expect(sum).toBe(doc.text.length);
  expect(s.aiUsed).toBe(doc.spans.some((x) => ["AI", "AI>HUM"].includes(x.provenance.origin)));
  const seg = segment(doc.text, doc.spans);
  if (!seg.ok) throw new Error("segment rejected a Document from the Engine");
  expect(s.sentences.total).toBe(seg.value.length);
  expect(s.sentences.byDominantOrigin).toEqual(tally(seg.value.map((x) => x.dominantOrigin)));
}

function checkRecords(c: ExportCase, s: Statement): void {
  const doc = c.document;
  const fulls = doc.citations.filter((r) => r.kind === "full");
  expect(s.citations).toHaveLength(fulls.length);
  fulls.forEach((r, i) => {
    const got = s.citations[i];
    expect(got?.text).toBe(r.citation.text);
    expect(got?.status).toBe(r.result.status);
    const id = r.result.status === "verified" ? r.result.clusterId : undefined;
    expect(got?.clusterId).toBe(id);
    expect(got !== undefined && "clusterId" in got).toBe(id !== undefined);
  });
  expect(s.quotes).toHaveLength(doc.quotes.length);
  doc.quotes.forEach((r, i) => {
    const got = s.quotes[i];
    expect(got?.text).toBe(r.quote.text);
    expect(got?.status).toBe(r.result.status);
    const prefix = r.result.status === "mismatch" ? r.result.prefixLength : undefined;
    expect(got?.prefixLength).toBe(prefix);
    expect(got !== undefined && "prefixLength" in got).toBe(prefix !== undefined);
  });
}

function checkOverridesAndTools(c: ExportCase, s: Statement): void {
  const doc = c.document;
  const expected = issues(doc).flatMap((issue) =>
    doc.overrides
      .filter((o) => o.key === issue.key)
      .map((o) => ({
        code: issue.code,
        text: doc.text.slice(issue.start, issue.end),
        reason: o.reason,
        timestamp: o.timestamp,
      })),
  );
  expect(s.overrides).toEqual(expected);
  expect(s.tools.map((t) => JSON.stringify([t.provider, t.model]))).toEqual(expectedTools(c));
}

function checkMeta(c: ExportCase, s: Statement): void {
  expect(s.generatedAt).toBe(c.meta.now.toISOString());
  expect(s.generatedDate).toBe(expectedDate(c.meta.now));
  expect(s.verifiedAt).toBe(c.meta.verifiedAt);
  expect(s.verifiedDate).toBe(
    c.meta.verifiedAt === null ? null : expectedDate(new Date(c.meta.verifiedAt)),
  );
}

describe("statement data _Requirements: 3.2, 3.5, 3.6, 3.7, 3.8, 3.9, 3.11, 3.13_", () => {
  // Property 2
  it("P2 buildStatement reports the Document's origins, records, overrides, tools and dates", () => {
    fc.assert(
      fc.property(arbExportCase, (c) => {
        const first = buildStatement(c.document, c.runLog, c.meta);
        expect(first.ok).toBe(true);
        if (!first.ok) return;
        checkCounts(c, first.value);
        checkRecords(c, first.value);
        checkOverridesAndTools(c, first.value);
        checkMeta(c, first.value);
        expect(buildStatement(c.document, c.runLog, c.meta)).toEqual(first);
      }),
      { numRuns: runs() },
    );
  });
});
