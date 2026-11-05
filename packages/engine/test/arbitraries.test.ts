import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { apply } from "../src/document";
import { validateConfig } from "../src/ops";
import { checkCoverage, normaliseSpans, originAt } from "../src/spans";
import {
  RUN_ID_POOL,
  arbAnyString,
  arbCallerInsertOrDelete,
  arbDocument,
  arbFaultyOp,
  arbOpSequence,
  arbReplace,
  arbThreshold,
  arbLabelling,
  arbSpanCorruption,
  arbSpanFragmentation,
  arbStringWithLoneSurrogate,
  arbText,
  arbTimestamp,
} from "../src/testing/arbitraries";
import type { EngineError } from "../src/errors";
import type { CallerOperation, Document, EngineConfig } from "../src/types";
import { firstUnpairedSurrogate, isTimestamp, isValidBoundary } from "../src/validate";
import { runs } from "./support/fc";

const runIdAt = (
  spans: readonly { start: number; end: number; provenance: { runId?: string } }[],
  i: number,
) => spans.find((s) => s.start <= i && i < s.end)?.provenance.runId;

describe("text arbitraries meet their definitions _Requirements: 22.1, 22.4_", () => {
  it("arbText is at most 2,000 code units with no unpaired surrogate", () => {
    fc.assert(
      fc.property(arbText, (t) => {
        expect(t.length).toBeLessThanOrEqual(2000);
        expect(firstUnpairedSurrogate(t)).toBeNull();
      }),
      runs(),
    );
  });

  it("arbTimestamp passes isTimestamp", () => {
    fc.assert(
      fc.property(arbTimestamp, (ts) => {
        expect(isTimestamp(ts)).toBe(true);
      }),
      runs(),
    );
  });

  it("arbStringWithLoneSurrogate records the first unpaired Offset", () => {
    fc.assert(
      fc.property(arbStringWithLoneSurrogate, ({ text, offset }) => {
        expect(firstUnpairedSurrogate(text)).toBe(offset);
      }),
      runs(),
    );
  });

  it("arbAnyString produces lone surrogates across samples", () => {
    const samples = fc.sample(arbAnyString, { numRuns: 500, seed: 1 });
    expect(samples.some((s) => firstUnpairedSurrogate(s) !== null)).toBe(true);
  });
});

describe("span arbitraries meet their definitions _Requirements: 22.1, 22.4_", () => {
  it("arbSpanFragmentation is valid, cuts at Valid_Boundaries, and keeps the labelling", () => {
    const arb = arbText.chain((t) =>
      arbLabelling(t).chain((l) => arbSpanFragmentation(t, l).map((f) => ({ t, l, f }))),
    );
    fc.assert(
      fc.property(arb, ({ t, l, f }) => {
        expect(checkCoverage(t.length, f).ok).toBe(true);
        for (const s of f) expect(isValidBoundary(t, s.start)).toBe(true);
        for (let i = 0; i < t.length; i++) {
          expect(originAt(f, i)).toBe(originAt(l, i));
          expect(runIdAt(f, i)).toBe(runIdAt(l, i));
        }
      }),
      runs(),
    );
  });

  it("arbSpanCorruption records the error checkCoverage and normaliseSpans report", () => {
    fc.assert(
      fc.property(arbSpanCorruption, ({ text, spans, expected }) => {
        expect(checkCoverage(text.length, spans)).toEqual({ ok: false, error: expected });
        expect(normaliseSpans(text.length, spans)).toEqual({ ok: false, error: expected });
      }),
      runs(),
    );
  });

  it("arbSpanCorruption generates every violation kind", () => {
    const kinds = new Set(
      fc.sample(arbSpanCorruption, { numRuns: 500, seed: 1 }).map((c) => c.expected.violation),
    );
    expect([...kinds].sort()).toEqual(["coverage", "empty", "gap", "overlap", "unsorted"]);
  });
});

const isAiHumCallerOp = (op: CallerOperation): boolean =>
  op.kind !== "delete" && op.provenance.origin === "AI>HUM";

/** Applies `ops` in order, returning the first failure or the final Document. */
function applyAll(doc: Document, ops: readonly CallerOperation[], config?: EngineConfig) {
  let current = doc;
  for (const op of ops) {
    const result = apply(current, op, config);
    if (!result.ok) return result;
    current = result.value.document;
  }
  return { ok: true as const, value: current };
}

describe("op arbitraries meet their definitions _Requirements: 22.1, 22.4_", () => {
  it("every arbOpSequence op applies under its config and none is an AI>HUM Insert or Replace", () => {
    const arb = fc
      .tuple(arbDocument, arbThreshold)
      .chain(([d, t]) => arbOpSequence(d, t.config).map((ops) => ({ d, t, ops })));
    fc.assert(
      fc.property(arb, ({ d, t, ops }) => {
        expect(ops.length).toBeLessThanOrEqual(20);
        expect(ops.filter(isAiHumCallerOp)).toEqual([]);
        expect(applyAll(d, ops, t.config).ok).toBe(true);
      }),
      runs(),
    );
  });

  it("arbCallerInsertOrDelete and arbReplace are valid single ops of their kinds", () => {
    const arb = arbDocument.chain((d) =>
      fc.tuple(arbCallerInsertOrDelete(d), arbReplace(d)).map(([a, r]) => ({ d, a, r })),
    );
    fc.assert(
      fc.property(arb, ({ d, a, r }) => {
        expect(["insert", "delete"]).toContain(a.kind);
        expect(r.kind).toBe("replace");
        expect(isAiHumCallerOp(a) || isAiHumCallerOp(r)).toBe(false);
        expect(apply(d, a).ok).toBe(true);
        expect(apply(d, r).ok).toBe(true);
      }),
      runs(),
    );
  });

  it("arbOpSequence includes AI Inserts and Replaces under relabelled Runs", () => {
    const arb = arbDocument.chain((d) => arbOpSequence(d).map((ops) => ({ d, ops })));
    const hits = fc.sample(arb, { numRuns: 300, seed: 1 }).filter(({ d, ops }) => {
      const relabelled = new Set(d.runs.filter((r) => r.relabelled).map((r) => r.runId));
      return ops.some(
        (op) =>
          op.kind !== "delete" &&
          op.provenance.origin === "AI" &&
          relabelled.has(op.provenance.runId ?? ""),
      );
    });
    expect(hits.length).toBeGreaterThan(10);
  });

  it("arbThreshold settings are valid and name their effective threshold", () => {
    fc.assert(
      fc.property(arbThreshold, ({ config, threshold }) => {
        expect(validateConfig(config)).toEqual({ ok: true, value: threshold });
      }),
      runs(),
    );
  });

  it("arbFaultyOp records the error apply returns, and apply leaves the Document unchanged", () => {
    const arb = arbDocument.chain((d) => arbFaultyOp(d).map((f) => ({ d, f })));
    fc.assert(
      fc.property(arb, ({ d, f }) => {
        const before = structuredClone(d);
        expect(apply(d, f.op, f.config)).toEqual({ ok: false, error: f.expected });
        expect(d).toEqual(before);
      }),
      runs(),
    );
  });

  it("arbFaultyOp covers every error kind and every invalid_provenance field", () => {
    const arb = arbDocument.chain(arbFaultyOp);
    const label = (e: EngineError): string => {
      if (e.kind === "invalid_provenance") return `${e.kind}:${e.field}`;
      if (e.kind === "split_surrogate") return `${e.kind}:${e.where}`;
      return e.kind;
    };
    const seen = new Set(fc.sample(arb, { numRuns: 1000, seed: 1 }).map((f) => label(f.expected)));
    expect([...seen].sort()).toEqual([
      "invalid_config",
      "invalid_provenance:actor",
      "invalid_provenance:origin",
      "invalid_provenance:runId",
      "invalid_timestamp",
      "inverted_range",
      "out_of_range",
      "split_surrogate:document",
      "split_surrogate:text",
    ]);
  });
});

describe("arbDocument meets its definition _Requirements: 22.1, 22.4_", () => {
  it("is canonical, has at most 64 spans, and draws Run_Ids from the pool of 8", () => {
    fc.assert(
      fc.property(arbDocument, (d) => {
        expect(normaliseSpans(d.text.length, d.spans)).toEqual({ ok: true, value: d.spans });
        expect(d.spans.length).toBeLessThanOrEqual(64);
        expect(d.runs.length).toBeLessThanOrEqual(8);
        for (const r of d.runs) expect(RUN_ID_POOL).toContain(r.runId);
      }),
      runs(),
    );
  });

  it("generates relabelled and non-relabelled Runs across samples", () => {
    const samples = fc.sample(arbDocument, { numRuns: 300, seed: 1 });
    const flags = samples.flatMap((d) => d.runs.map((r) => r.relabelled));
    expect(flags.filter((f) => f).length).toBeGreaterThan(30);
    expect(flags.filter((f) => !f).length).toBeGreaterThan(30);
  });
});
