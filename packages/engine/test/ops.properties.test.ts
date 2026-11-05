import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { apply, createDocument } from "../src/document";
import { structuralEqual } from "../src/equal";
import {
  arbCallerInsertOrDelete,
  arbDocument,
  arbFaultyOp,
  arbOp,
  arbOpTrace,
  arbReplace,
  arbThreshold,
  type OpStep,
} from "../src/testing/arbitraries";
import type {
  Applied,
  CallerOperation,
  Delete,
  Document,
  EngineConfig,
  Insert,
  Inverse,
  Provenance,
} from "../src/types";
import { runs } from "./support/fc";
import { isEmptyOp, lengthsOf, modelText, modelUnits, unitsOf } from "./support/units";

const T0 = "2026-11-03T10:00:00Z";
const T1 = "2026-11-03T10:05:00Z";

/** The Document `apply` returns; fails the test on an Engine_Error. */
function applied(doc: Document, op: CallerOperation, config?: EngineConfig): Document {
  const result = apply(doc, op, config);
  if (!result.ok) throw new Error(`fixture: apply failed with ${result.error.kind}`);
  return result.value.document;
}

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe("Property 6: Insert and Delete agree with a per-code-unit model _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.7, 4.11, 4.12_", () => {
  it("matches the model's Text and per-Offset (Origin, Run_Id, Timestamp)", () => {
    const arbCase = fc
      .tuple(arbDocument, arbThreshold)
      .chain(([doc, setting]) => arbCallerInsertOrDelete(doc).map((op) => ({ doc, setting, op })));
    // Property 6
    fc.assert(
      fc.property(arbCase, ({ doc, setting, op }) => {
        const result = apply(doc, op, setting.config);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const next = result.value.document;
        expect(next.text).toBe(modelText(doc, op));
        expect(unitsOf(next)).toEqual(modelUnits(doc, op, setting.threshold));
        if (isEmptyOp(op)) expect(structuralEqual(next, doc)).toBe(true);
        if (op.kind === "delete") expect(lengthsOf(next.runs)).toEqual(lengthsOf(doc.runs));
      }),
      runs(),
    );
  });

  // Shrunk from seed -1752189824: an empty Insert under a threshold below a
  // Run's Edited_Proportion still returns the input Document (Req 4.7).
  it("an empty op under a lower threshold relabels nothing", () => {
    const created = createDocument("abcdefghij", T0);
    if (!created.ok) throw new Error("fixture: createDocument failed");
    const ai: Provenance = { origin: "AI", runId: "r1", timestamp: T1 };
    const withAi = applied(created.value, {
      kind: "insert",
      at: 0,
      text: "0123456789",
      provenance: ai,
    });
    const doc = applied(withAi, { kind: "delete", from: 2, to: 3, actor: "HUM" });
    expect(doc.runs).toEqual([
      { runId: "r1", originalLength: 10, editedCount: 1, relabelled: false },
    ]);
    const empty: Insert = { kind: "insert", at: 0, text: "", provenance: ai };
    expect(applied(doc, empty, { relabelThreshold: 0.05 })).toBe(doc);
  });
});

describe("Property 7: Replace equals Delete followed by Insert _Requirements: 4.6, 6.9_", () => {
  it("apply(d, Replace) is structurally equal to Delete then Insert, with one Inverse back to d", () => {
    const arbCase = fc
      .tuple(arbDocument, arbThreshold)
      .chain(([doc, setting]) => arbReplace(doc).map((op) => ({ doc, setting, op })));
    // Property 7
    fc.assert(
      fc.property(arbCase, ({ doc, setting, op }) => {
        const { config } = setting;
        const result = apply(doc, op, config);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const del: Delete = {
          kind: "delete",
          from: op.from,
          to: op.to,
          actor: op.provenance.origin,
        };
        const ins: Insert = {
          kind: "insert",
          at: op.from,
          text: op.text,
          provenance: op.provenance,
        };
        const sequential = applied(applied(doc, del, config), ins, config);
        expect(result.value.document).toEqual(sequential);
        expect(structuralEqual(result.value.document, sequential)).toBe(true);
        const undone = apply(result.value.document, result.value.inverse, config);
        expect(undone.ok).toBe(true);
        if (undone.ok) expect(structuralEqual(undone.value.document, doc)).toBe(true);
      }),
      runs(),
    );
  });

  // Req 6.9: the delete alone leaves r1 at 2/10, under 0.4; the insert inside
  // the Run_Extent brings it to 7/10, so the Replace relabels r1, as the
  // sequential Delete then Insert does.
  it("a Replace that crosses the threshold only after both counts relabels like the sequence", () => {
    const created = createDocument("abcdefghij", T0);
    if (!created.ok) throw new Error("fixture: createDocument failed");
    const ai: Provenance = { origin: "AI", runId: "r1", timestamp: T1 };
    const doc = applied(created.value, {
      kind: "insert",
      at: 0,
      text: "0123456789",
      provenance: ai,
    });
    const hum: Provenance = { origin: "HUM", timestamp: T1 };
    const del: Delete = { kind: "delete", from: 1, to: 3, actor: "HUM" };
    expect(applied(doc, del).runs).toEqual([
      { runId: "r1", originalLength: 10, editedCount: 2, relabelled: false },
    ]);
    const result = apply(doc, { kind: "replace", from: 1, to: 3, text: "xxxxx", provenance: hum });
    if (!result.ok) throw new Error("fixture: replace failed");
    const sequential = applied(applied(doc, del), {
      kind: "insert",
      at: 1,
      text: "xxxxx",
      provenance: hum,
    });
    expect(result.value.document.runs).toEqual([
      { runId: "r1", originalLength: 10, editedCount: 7, relabelled: true },
    ]);
    expect(structuralEqual(result.value.document, sequential)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Property 8 helpers: walk a trace forward, then undo it and redo each step.
// ---------------------------------------------------------------------------

/** `apply(doc, inv)` must succeed and return exactly one Inverse (Req 5.1, 5.5). */
function appliedInverse(doc: Document, inv: Inverse, config?: EngineConfig): Applied {
  const result = apply(doc, inv, config);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`apply(inverse) failed with ${result.error.kind}`);
  expect(result.value.inverse.kind).toBe("inverse");
  return result.value;
}

/** Full Document equality: the engine's structural check and a deep field-by-field one. */
function expectSameDocument(actual: Document, expected: Document): void {
  expect(structuralEqual(actual, expected)).toBe(true);
  expect(actual).toEqual(expected);
}

/** `d0 … dn` and `i1 … in` from a trace whose every step must succeed (Req 5.1). */
function forwardChain(d0: Document, steps: readonly OpStep[]): [Document[], Inverse[]] {
  const docs: Document[] = [d0];
  const inverses: Inverse[] = [];
  for (const { result } of steps) {
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`apply failed with ${result.error.kind}`);
    expect(result.value.inverse.kind).toBe("inverse");
    docs.push(result.value.document);
    inverses.push(result.value.inverse);
  }
  return [docs, inverses];
}

describe("Property 8: Undo and redo restore documents exactly _Requirements: 4.7, 5.1, 5.3, 5.4, 5.5, 5.6_", () => {
  it("applying in … i1 returns dn−1 … d0, and each redo Inverse returns the undone Document", () => {
    const arbCase = fc
      .tuple(arbDocument, arbThreshold)
      .chain(([doc, setting]) =>
        arbOpTrace(doc, setting.config).map((steps) => ({ doc, setting, steps })),
      );
    // Property 8
    fc.assert(
      fc.property(arbCase, ({ doc, setting, steps }) => {
        const { config } = setting;
        const [docs, inverses] = forwardChain(doc, steps);
        let current = docs[docs.length - 1] as Document;
        for (let k = inverses.length; k >= 1; k--) {
          const undone = appliedInverse(current, inverses[k - 1] as Inverse, config);
          expectSameDocument(undone.document, docs[k - 1] as Document);
          const redone = appliedInverse(undone.document, undone.inverse, config);
          expectSameDocument(redone.document, docs[k] as Document);
          current = undone.document;
        }
      }),
      runs(),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 9 helpers: a Document other than the one an Inverse expects.
// ---------------------------------------------------------------------------

/** A Caller_Operation that is not a no-op (Req 4.7). */
const isNonEmptyOp = (op: CallerOperation): boolean =>
  op.kind === "delete"
    ? op.from < op.to
    : op.text.length > 0 || (op.kind === "replace" && op.from < op.to);

/**
 * Candidates for the wrong Document: an independent `arbDocument`, `d`
 * itself, or `next` after one more non-empty op. Equality with `next` is
 * filtered out by the caller.
 */
function arbOtherDocument(d: Document, next: Document): fc.Arbitrary<Document> {
  const edited = arbOp(next)
    .filter(isNonEmptyOp)
    .map((op) => applied(next, op));
  return fc.oneof(arbDocument, fc.constant(d), edited);
}

describe("Property 9: An Inverse applied to the wrong Document is rejected _Requirements: 5.7_", () => {
  it("apply(e, i) returns stale_inverse and leaves e unchanged when e is not i.expect", () => {
    const arbCase = arbDocument
      .chain((d) => arbOp(d).map((op) => ({ d, op })))
      .map(({ d, op }) => {
        const result = apply(d, op);
        if (!result.ok) throw new Error(`fixture: apply failed with ${result.error.kind}`);
        return { d, inverse: result.value.inverse };
      })
      .chain(({ d, inverse }) =>
        arbOtherDocument(d, inverse.expect)
          .filter((e) => !structuralEqual(e, inverse.expect))
          .map((e) => ({ inverse, e })),
      );
    // Property 9
    fc.assert(
      fc.property(arbCase, ({ inverse, e }) => {
        const before = structuredClone(e);
        expect(apply(e, inverse)).toEqual({ ok: false, error: { kind: "stale_inverse" } });
        expect(e).toEqual(before);
      }),
      runs(),
    );
  });
});

describe("Property 10: Rejected operations return the first error in precedence and change nothing _Requirements: 2.5, 5.2, 6.6, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_", () => {
  it("apply(d, faulty op) returns exactly the recorded first error, no Inverse, and leaves d unchanged", () => {
    const arbCase = arbDocument.chain((d) => arbFaultyOp(d).map((faulty) => ({ d, faulty })));
    // Property 10
    fc.assert(
      fc.property(arbCase, ({ d, faulty: { op, config, expected } }) => {
        const before = structuredClone(d);
        const result = apply(d, op, config);
        expect(result).toStrictEqual({ ok: false, error: expected });
        expect("value" in result).toBe(false);
        expect(d).toStrictEqual(before);
        expect(structuralEqual(d, before)).toBe(true);
      }),
      runs(),
    );
  });
});
