import { apply, createDocument, issues } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { buildStatement } from "../src/index.js";
import type { Meta, RunInfo } from "../src/index.js";
import {
  DEMO_NOW,
  DEMO_OVERRIDE_REASONS,
  DEMO_RUN_LOG,
  DEMO_VERIFIED_AT,
  buildDemoDocument,
} from "./support/demo-document.js";

const T0 = "2026-01-01T00:00:00.000Z";
const META: Meta = { now: DEMO_NOW, verifiedAt: DEMO_VERIFIED_AT };

function must<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error("fixture rejected");
  return r.value;
}

function plain(text: string): Document {
  return must(createDocument(text, T0));
}

/** A document whose text is typed, then one assistant insertion for each run id. */
function withRuns(runIds: readonly string[]): Document {
  let doc = plain("Typed text.");
  for (const runId of runIds) {
    const at = doc.text.length;
    doc = must(
      apply(doc, {
        kind: "insert",
        at,
        text: ` Added by ${runId}.`,
        provenance: { origin: "AI", runId, timestamp: T0 },
      }),
    ).document;
  }
  return doc;
}

function ok(doc: Document, log: readonly RunInfo[], meta: Meta = META) {
  return must(buildStatement(doc, log, meta));
}

describe("buildStatement tools", () => {
  it("removes equal provider and model pairs, keeping first-occurrence order", () => {
    const doc = withRuns(["a", "b", "c"]);
    const log: RunInfo[] = [
      { runId: "a", provider: "p1", modelId: "m" },
      { runId: "b", provider: "p2", modelId: null },
      { runId: "c", provider: "p1", modelId: "m" },
    ];
    expect(ok(doc, log).tools).toEqual([
      { provider: "p1", model: "m" },
      { provider: "p2", model: null },
    ]);
  });

  it("omits a run with no run-log entry and still returns Ok", () => {
    const doc = withRuns(["a", "b"]);
    const s = ok(doc, [{ runId: "b", provider: "p", modelId: "m" }]);
    expect(s.tools).toEqual([{ provider: "p", model: "m" }]);
    expect(s.aiUsed).toBe(true);
  });

  it("ignores run-log entries whose run is not in the document", () => {
    const doc = withRuns(["a"]);
    const log: RunInfo[] = [
      { runId: "a", provider: "p", modelId: "m" },
      { runId: "zzz", provider: "other", modelId: "x" },
    ];
    expect(ok(doc, log).tools).toEqual([{ provider: "p", model: "m" }]);
  });
});

describe("buildStatement counts and caption", () => {
  it("gives caption empty, zero sentences and four zero counts for the empty document", () => {
    const s = ok(plain(""), []);
    expect(s.caption).toBe("");
    expect(s.sentences.total).toBe(0);
    expect(s.sentences.byDominantOrigin).toEqual({ HUM: 0, PST: 0, AI: 0, "AI>HUM": 0 });
    expect(s.characters).toEqual({ HUM: 0, PST: 0, AI: 0, "AI>HUM": 0 });
    expect(s.aiUsed).toBe(false);
  });

  it("counts characters per origin and sets the caption from the first non-empty line", () => {
    const doc = withRuns(["a"]);
    const s = ok(doc, []);
    // createDocument records initial text as PST (origin unknown).
    expect(s.characters.PST).toBe("Typed text.".length);
    expect(s.characters.HUM).toBe(0);
    expect(s.characters.AI).toBe(" Added by a.".length);
    expect(s.caption).toBe("Typed text. Added by a.");
  });
});

describe("buildStatement errors", () => {
  it("returns the segment error unchanged and does not mutate", () => {
    const bad: Document = { ...plain("Some text."), spans: [] };
    const before = JSON.stringify(bad);
    const log: RunInfo[] = [{ runId: "a", provider: "p", modelId: null }];
    const r = buildStatement(bad, log, META);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("invalid_spans");
    expect(JSON.stringify(bad)).toBe(before);
    expect(log).toEqual([{ runId: "a", provider: "p", modelId: null }]);
  });

  it("returns invalid_timestamp for an invalid now", () => {
    const r = buildStatement(plain("x"), [], { now: new Date(Number.NaN), verifiedAt: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("invalid_timestamp");
  });

  it("returns invalid_timestamp for a garbled verifiedAt", () => {
    const r = buildStatement(plain("x"), [], { now: DEMO_NOW, verifiedAt: "yesterday" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("invalid_timestamp");
  });
});

describe("buildStatement dates", () => {
  const instant = "2026-03-05T02:30:00.000Z";

  it("uses the local date (America/Los_Angeles) for generatedDate and verifiedDate", () => {
    const s = ok(plain("x"), [], { now: new Date(instant), verifiedAt: instant });
    expect(s.generatedAt).toBe(instant);
    expect(s.generatedDate).toBe("2026-03-04");
    expect(s.verifiedAt).toBe(instant);
    expect(s.verifiedDate).toBe("2026-03-04");
  });

  it("gives null verifiedAt and verifiedDate when there was no Verify", () => {
    const s = ok(plain("x"), [], { now: DEMO_NOW, verifiedAt: null });
    expect(s.verifiedAt).toBeNull();
    expect(s.verifiedDate).toBeNull();
  });

  it("returns deeply equal results for deeply equal arguments", () => {
    const doc = withRuns(["a"]);
    const log: RunInfo[] = [{ runId: "a", provider: "p", modelId: "m" }];
    expect(ok(doc, log)).toEqual(ok(doc, log));
  });
});

describe("buildStatement on the demo document", () => {
  it("lists citations, quotes and overrides", async () => {
    const doc = await buildDemoDocument();
    const s = ok(doc, DEMO_RUN_LOG);
    const count = (st: string) => s.citations.filter((c) => c.status === st).length;
    expect(count("verified")).toBe(2);
    expect(count("not_found")).toBe(3);
    expect(s.citations.filter((c) => c.clusterId !== undefined)).toHaveLength(2);
    expect(s.quotes.filter((q) => q.status === "mismatch")).toHaveLength(1);
    expect(s.quotes.filter((q) => q.prefixLength !== undefined)).toHaveLength(1);
    expect(s.overrides.map((o) => o.reason).sort()).toEqual([...DEMO_OVERRIDE_REASONS].sort());
    expect(s.overrides.map((o) => o.code)).toEqual(issues(doc).map((i) => i.code));
    expect(s.tools).toEqual([{ provider: "fixture", model: "fixture-model" }]);
  });

  it("omits an override that belongs to no current issue", async () => {
    const doc = await buildDemoDocument();
    const extra = { key: "k99999", reason: "stale", timestamp: T0 };
    const s = ok({ ...doc, overrides: [...doc.overrides, extra] }, DEMO_RUN_LOG);
    expect(s.overrides).toHaveLength(4);
    expect(s.overrides.some((o) => o.reason === "stale")).toBe(false);
  });
});
