import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { extract } from "../src/citations/extract";
import { apply, createDocument } from "../src/document";
import {
  arbCreatedDocument,
  arbDocument,
  arbOpTrace,
  arbStringWithLoneSurrogate,
  arbText,
  arbTextWithCitations,
  arbThreshold,
  arbTimestamp,
  type OpStep,
} from "../src/testing/arbitraries";
import type { Document, EngineConfig, Inverse, Provenance } from "../src/types";
import { runs } from "./support/fc";

const hasRunId = (p: Provenance): boolean => Object.prototype.hasOwnProperty.call(p, "runId");

/** Test-local Mergeable (Glossary): equal Origins and equal-or-both-absent Run_Ids. */
const mergeable = (a: Provenance, b: Provenance): boolean =>
  a.origin === b.origin && hasRunId(a) === hasRunId(b) && a.runId === b.runId;

/** One broken rule, with the Offsets and values that broke it. */
type Violation = Readonly<Record<string, unknown>>;

/** Coverage_Invariant (Glossary, Req 3.1): non-empty, sorted, gap-free, exact cover. */
function coverageViolations(doc: Document): readonly Violation[] {
  const out: Violation[] = [];
  let cursor = 0;
  doc.spans.forEach((s, i) => {
    const { start, end } = s;
    if (!Number.isInteger(start) || !Number.isInteger(end)) out.push({ rule: "integer", i });
    if (end <= start) out.push({ rule: "non_empty", i, start, end });
    if (start !== cursor) out.push({ rule: "contiguous", i, start, expected: cursor });
    cursor = end;
  });
  if (cursor !== doc.text.length) out.push({ rule: "cover", end: cursor, len: doc.text.length });
  return out;
}

/** Canonical_Document (Req 3.2): no two adjacent Spans Mergeable. */
function canonicalViolations(doc: Document): readonly Violation[] {
  const out: Violation[] = [];
  for (let i = 1; i < doc.spans.length; i++) {
    const [a, b] = [doc.spans[i - 1], doc.spans[i]];
    if (a && b && mergeable(a.provenance, b.provenance)) out.push({ rule: "canonical", i });
  }
  return out;
}

/**
 * Run invariant (Req 6.12): every span Run_Id has a Run table entry; flag
 * `false` means all its Spans are `AI`, flag `true` means all are `AI>HUM`.
 * Hence no Run holds both.
 */
function runViolations(doc: Document): readonly Violation[] {
  const out: Violation[] = [];
  doc.spans.forEach((s, i) => {
    const { origin, runId } = s.provenance;
    const isAi = origin === "AI" || origin === "AI>HUM";
    if (isAi !== hasRunId(s.provenance)) out.push({ rule: "run_id_iff_ai", i, origin });
    if (runId === undefined) return;
    const entry = doc.runs.find((r) => r.runId === runId);
    if (!entry) {
      out.push({ rule: "run_entry", i, runId });
      return;
    }
    const want = entry.relabelled ? "AI>HUM" : "AI";
    if (origin !== want) out.push({ rule: "flag", i, runId, relabelled: entry.relabelled, origin });
  });
  return out;
}

const violations = (doc: Document): readonly Violation[] => [
  ...coverageViolations(doc),
  ...canonicalViolations(doc),
  ...runViolations(doc),
];

/** Unwraps an apply Result, failing the property on an error. */
function applied(
  r: ReturnType<typeof apply>,
  what: string,
): { document: Document; inverse: Inverse } {
  if (!r.ok) throw new Error(`${what} rejected: ${JSON.stringify(r.error)}`);
  return r.value;
}

/**
 * Every Document returned along the trace: each forward step, then undo of
 * every step in reverse order, and the redo returned by each undo.
 */
function returnedDocuments(
  start: Document,
  steps: readonly OpStep[],
  config: EngineConfig | undefined,
): readonly Document[] {
  const docs: Document[] = [];
  const inverses: Inverse[] = [];
  steps.forEach((s, i) => {
    const a = applied(s.result, `step ${String(i)} ${s.op.kind}`);
    docs.push(a.document);
    inverses.push(a.inverse);
  });
  let doc = docs.at(-1) ?? start;
  for (const inv of inverses.reverse()) {
    const undo = applied(apply(doc, inv, config), "undo");
    const redo = applied(apply(undo.document, undo.inverse, config), "redo");
    docs.push(undo.document, redo.document);
    doc = undo.document;
  }
  return docs;
}

/** An empty Document, so Req 4.10 (ops on an empty Document) is exercised often. */
const arbEmptyDocument: fc.Arbitrary<Document> = arbTimestamp.map((ts) => {
  const r = createDocument("", ts);
  if (!r.ok) throw new Error(`createDocument("") rejected: ${JSON.stringify(r.error)}`);
  return r.value;
});

const arbStartAndTrace = fc
  .tuple(fc.oneof(arbDocument, arbCreatedDocument, arbEmptyDocument), arbThreshold)
  .chain(([start, { config }]) =>
    arbOpTrace(start, config).map((steps) => ({ start, config, steps })),
  );

describe("every returned Document _Requirements: 3.1, 3.2, 4.10, 6.12_", () => {
  // Property 1
  it("is canonical and satisfies the Run invariant, forward, undo, and redo", () => {
    fc.assert(
      fc.property(arbStartAndTrace, ({ start, config, steps }) => {
        expect(violations(start)).toEqual([]);
        const docs = returnedDocuments(start, steps, config);
        expect(docs.length).toBe(3 * steps.length);
        docs.forEach((doc, i) => {
          expect({ i, v: violations(doc) }).toEqual({ i, v: [] });
        });
      }),
      runs(),
    );
  });
});

/** Creation input: a valid text, or a string with a lone surrogate at `offset`. */
type CreationInput =
  | Readonly<{ kind: "valid"; text: string; ts: string }>
  | Readonly<{ kind: "surrogate"; text: string; offset: number; ts: string }>;

const arbCreationInput: fc.Arbitrary<CreationInput> = fc.oneof(
  fc
    .tuple(
      fc.oneof(
        arbTextWithCitations.map((t) => t.text),
        arbText,
        fc.constant(""),
      ),
      arbTimestamp,
    )
    .map(([text, ts]) => ({ kind: "valid" as const, text, ts })),
  fc
    .tuple(arbStringWithLoneSurrogate, arbTimestamp)
    .map(([s, ts]) => ({ kind: "surrogate" as const, text: s.text, offset: s.offset, ts })),
);

/**
 * Test-local Issue_Key assignment at creation (Glossary): the keys of every
 * Full_Citation, Short_Form, and Quote_Candidate in issue order (ascending
 * start, a Citation before a Quote_Candidate at an equal start), skipping
 * Other_References.
 */
function keysInIssueOrder(doc: Document): readonly string[] {
  const items: { start: number; tie: number; key: string }[] = [];
  for (const r of doc.citations) {
    if (r.kind !== "other") items.push({ start: r.citation.start, tie: 0, key: r.key });
  }
  for (const q of doc.quotes) items.push({ start: q.quote.start, tie: 1, key: q.key });
  return items.sort((a, b) => a.start - b.start || a.tie - b.tie).map((i) => i.key);
}

/** Expected record kind for an extracted value (Glossary). */
const recordKind = (k: string): string =>
  k === "other" ? "other" : k === "short" ? "short" : "full";

/** Req 2.3 and Issue_Key assignment: the citation layer is the Extractor's, unchecked and keyed. */
function expectCreatedLayer(doc: Document, text: string): void {
  const e = extract(text);
  expect(doc.citations.map((r) => r.citation)).toEqual(e.citations);
  expect(doc.quotes.map((q) => q.quote)).toEqual(e.quotes);
  expect(doc.citations.map((r) => r.kind)).toEqual(
    e.citations.map((c) => recordKind(c.value.kind)),
  );
  for (const r of doc.citations) {
    if (r.kind === "full") expect(r.result).toEqual({ status: "unchecked" });
  }
  for (const q of doc.quotes) expect(q.result).toEqual({ status: "unchecked" });
  const keys = keysInIssueOrder(doc);
  expect(keys).toEqual(keys.map((_, n) => `k${String(n)}`));
  expect(doc.keyCounter).toBe(keys.length);
}

/** Req 2.1, 2.2: Text, one PST Span with `ts` (none when empty), no Runs, no Overrides. */
function expectCreatedState(doc: Document, text: string, ts: string): void {
  expect(doc.text).toBe(text);
  const spans =
    text.length === 0
      ? []
      : [{ start: 0, end: text.length, provenance: { origin: "PST", timestamp: ts } }];
  expect(doc.spans).toEqual(spans);
  expect(doc.runs).toEqual([]);
  expect(doc.overrides).toEqual([]);
}

describe("createDocument _Requirements: 2.1, 2.2, 2.3, 2.6_", () => {
  // Property 2
  it("preserves text and starts as one PST span with extracted, unchecked citations", () => {
    fc.assert(
      fc.property(arbCreationInput, (input) => {
        const r = createDocument(input.text, input.ts);
        if (input.kind === "surrogate") {
          expect(r).toEqual({
            ok: false,
            error: { kind: "split_surrogate", offset: input.offset, where: "text" },
          });
          return;
        }
        if (!r.ok) throw new Error(`createDocument rejected: ${JSON.stringify(r.error)}`);
        expectCreatedState(r.value, input.text, input.ts);
        expectCreatedLayer(r.value, input.text);
      }),
      runs(),
    );
  });
});
