import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { CallerOperation, Declaration, Document } from "@reveal-codes/engine";
import {
  arbDeclaration,
  arbEditSequence,
  arbMixedOriginDocument,
} from "../../../packages/engine/src/testing/arb-declaration";
import { reduce, type StoreAction, type StoreState } from "../src/store";
import { createManualClock } from "./support/clock";
import { runs } from "./support/fc";

/** One character of the reference model: a unique id, a code unit, and whether it is pasted. */
type Cell = Readonly<{ id: number; unit: string; pasted: boolean }>;
type Cells = readonly Cell[];

const NON_SPACE = /\P{White_Space}/u;

const arbScenario = fc
  .tuple(arbMixedOriginDocument, arbDeclaration())
  .chain(([doc, declaration]) =>
    arbEditSequence(doc).map((steps) => ({ doc, declaration, steps })),
  );

function cellsOf(doc: Document, nextId: () => number): Cells {
  const cells: Cell[] = [];
  for (const span of doc.spans) {
    for (let i = span.start; i < span.end; i += 1) {
      cells.push({
        id: nextId(),
        unit: doc.text.charAt(i),
        pasted: span.provenance.origin === "PST",
      });
    }
  }
  return cells;
}

function applyToCells(cells: Cells, op: CallerOperation, nextId: () => number): Cells {
  const born = (text: string, pasted: boolean): Cells =>
    Array.from({ length: text.length }, (_, i) => ({
      id: nextId(),
      unit: text.charAt(i),
      pasted,
    }));
  switch (op.kind) {
    case "insert":
      return [
        ...cells.slice(0, op.at),
        ...born(op.text, op.provenance.origin === "PST"),
        ...cells.slice(op.at),
      ];
    case "delete":
      return [...cells.slice(0, op.from), ...cells.slice(op.to)];
    case "replace":
      return [
        ...cells.slice(0, op.from),
        ...born(op.text, op.provenance.origin === "PST"),
        ...cells.slice(op.to),
      ];
  }
}

const sameCells = (a: Cells, b: Cells): boolean =>
  a.length === b.length && a.every((c, i) => c.id === b[i]?.id);

const textOf = (cells: Cells): string => cells.map((c) => c.unit).join("");

describe("Property 4: a stored Declaration is cleared exactly when pasted text is added or none remains _Requirements: 5.3, 5.6, 5.7, 5.12, 11.5_", () => {
  // Property 4
  it("P4 the stored Declaration is null on new PST, null on no substantive PST for pasted_text, else unchanged", () => {
    fc.assert(
      fc.property(arbScenario, ({ doc, declaration, steps }) => {
        const clock = createManualClock();
        let state: StoreState = {
          document: doc,
          undo: [],
          redo: [],
          runLog: [],
          verifiedAt: null,
          declaration,
          notice: null,
          epoch: 0,
        };
        let counter = 0;
        const nextId = (): number => (counter += 1);
        let cells = cellsOf(doc, nextId);
        const undoStack: Cells[] = [];
        const redoStack: Cells[] = [];

        for (const step of steps) {
          // Beyond the coalescing window, so every edit is its own Undo_Group.
          clock.advance(5000);
          const beforeIds = new Set(cells.map((c) => c.id));
          const before: Declaration | null = state.declaration;
          let action: StoreAction;
          if (step.kind === "edit") {
            action = { type: "edit", ops: [step.op] };
            // The generator tracks the engine's history, which also records no-op edits;
            // the Store does not, so after an undo an operation can be out of range for the
            // Store's Document. The Store rejects it with a notice and the model skips it.
            const rejected = reduce(state, action, clock.now).state.notice !== null;
            const next = rejected ? cells : applyToCells(cells, step.op, nextId);
            if (!sameCells(next, cells)) {
              undoStack.push(cells);
              redoStack.length = 0;
              cells = next;
            }
          } else if (step.kind === "undo") {
            action = { type: "undo" };
            const prior = undoStack.pop();
            if (prior !== undefined) {
              redoStack.push(cells);
              cells = prior;
            }
          } else {
            action = { type: "redo" };
            const later = redoStack.pop();
            if (later !== undefined) {
              undoStack.push(cells);
              cells = later;
            }
          }
          state = reduce(state, action, clock.now).state;

          expect(state.document.text).toBe(textOf(cells));
          const addedPasted = cells.some((c) => c.pasted && !beforeIds.has(c.id));
          const substantive = cells.some((c) => c.pasted && NON_SPACE.test(c.unit));
          if (addedPasted || before === null) {
            expect(state.declaration).toBeNull();
          } else if (before.subject === "pasted_text" && !substantive) {
            expect(state.declaration).toBeNull();
          } else {
            expect(state.declaration).toEqual(before);
          }
        }
      }),
      { numRuns: runs() },
    );
  });
});
