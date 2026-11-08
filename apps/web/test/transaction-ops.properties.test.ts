import { apply, createDocument } from "@reveal-codes/engine";
import type { CallerOperation, Document } from "@reveal-codes/engine";
import { ReplaceStep } from "@tiptap/pm/transform";
import type { Step } from "@tiptap/pm/transform";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { docText } from "../src/editor/offsets";
import { mapSteps } from "../src/editor/transaction-ops";
import { arbEditPlan } from "./arbitraries";
import { runs } from "./support/fc";
import { buildTransaction, stateFromText } from "./support/pm";

const newlines = (s: string): number => s.split("\n").length - 1;

/** Newlines each operation must carry: the paragraph boundaries of its step's slice. */
function expectedNewlines(steps: readonly Step[]): readonly number[] {
  const out: number[] = [];
  for (const step of steps) {
    if (!(step instanceof ReplaceStep)) throw new Error("generator produced a non-replace step");
    if (step.from === step.to && step.slice.size === 0) continue;
    out.push(Math.max(0, step.slice.content.childCount - 1));
  }
  return out;
}

function opText(op: CallerOperation): string {
  return op.kind === "delete" ? "" : op.text;
}

function mirrorText(before: string, ops: readonly CallerOperation[]): string {
  const created = createDocument(before, "2026-01-01T00:00:00.000Z");
  if (!created.ok) throw new Error(`start document rejected: ${created.error.kind}`);
  let doc: Document = created.value;
  for (const op of ops) {
    const applied = apply(doc, op);
    expect(applied.ok).toBe(true);
    if (!applied.ok) throw new Error(`engine rejected ${applied.error.kind}`);
    doc = applied.value.document;
  }
  return doc.text;
}

describe("Property 2: mirror invariant _Requirements: 5.1, 5.3, 5.4, 5.8_", () => {
  // Property 2
  it("operations from each transaction reproduce the editor text, with provenance and boundaries", () => {
    fc.assert(
      fc.property(arbEditPlan, (plan) => {
        let state = stateFromText(plan.lines.join("\n"));
        for (const tx of plan.transactions) {
          const before = docText(state.doc);
          const tr = buildTransaction(state, tx.steps);
          const next = state.apply(tr);
          const mapping = mapSteps(before, tr.steps, tx.provenance);
          expect(mirrorText(before, mapping.ops)).toBe(docText(next.doc));
          for (const op of mapping.ops) {
            if (op.kind === "delete") expect(op.actor).toBe(tx.provenance.origin);
            else expect(op.provenance).toStrictEqual(tx.provenance);
          }
          if (mapping.path === "mapped") {
            const counts = mapping.ops.map((op) => newlines(opText(op)));
            expect(counts).toEqual(expectedNewlines(tr.steps));
          }
          state = next;
        }
      }),
      { numRuns: runs() },
    );
  });
});
