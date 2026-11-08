import { blockingIssues } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { buildDemoDocument, DEMO_OVERRIDE_REASONS, DEMO_RUN_LOG } from "./demo-document";

describe("buildDemoDocument", () => {
  it("yields 2 verified, 3 not found, 1 mismatch, 4 overrides, one run, no blocking issues", async () => {
    const doc = await buildDemoDocument();
    const full = doc.citations.filter((c) => c.kind === "full");
    expect(full.filter((c) => c.result.status === "verified")).toHaveLength(2);
    expect(full.filter((c) => c.result.status === "not_found")).toHaveLength(3);
    expect(doc.quotes.filter((q) => q.result.status === "mismatch")).toHaveLength(1);
    expect(doc.overrides).toHaveLength(4);
    expect(doc.runs).toHaveLength(1);
    expect(doc.runs[0]?.runId).toBe("run-1");
    expect(blockingIssues(doc)).toHaveLength(0);
    expect(doc.spans.some((s) => s.provenance.origin === "AI")).toBe(true);
  });

  it("uses four distinct reasons and a run log with one unused run", () => {
    expect(new Set(DEMO_OVERRIDE_REASONS).size).toBe(4);
    expect(DEMO_RUN_LOG.map((r) => r.runId)).toEqual(["run-1", "run-9"]);
  });

  it("makes no request outside the recorded fixtures", async () => {
    const original = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = ((input: unknown) => {
      calls.push(String(input));
      return Promise.reject(new Error("network is not allowed"));
    }) as typeof fetch;
    try {
      await buildDemoDocument();
    } finally {
      globalThis.fetch = original;
    }
    expect(calls).toEqual([]);
  });
});
