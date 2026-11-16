import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { CallerOperation, Declaration, Document } from "@reveal-codes/engine";
import {
  arbDeclaration,
  arbEditSequence,
  arbMixedOriginDocument,
  type EditStep,
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

/** The reference model: cells plus the snapshot stacks for undo and redo. */
type Model = { cells: Cells; undoStack: Cells[]; redoStack: Cells[]; counter: number };

const nextIdOf = (model: Model) => (): number => (model.counter += 1);

function initialState(doc: Document, declaration: Declaration): StoreState {
  return {
    document: doc,
    undo: [],
    redo: [],
    runLog: [],
    verifiedAt: null,
    declaration,
    notice: null,
    openNote: null,
    epoch: 0,
  };
}

function modelEdit(model: Model, op: CallerOperation, rejected: boolean): void {
  const next = rejected ? model.cells : applyToCells(model.cells, op, nextIdOf(model));
  if (sameCells(next, model.cells)) return;
  model.undoStack.push(model.cells);
  model.redoStack.length = 0;
  model.cells = next;
}

function modelMove(model: Model, from: Cells[], to: Cells[]): void {
  const target = from.pop();
  if (target === undefined) return;
  to.push(model.cells);
  model.cells = target;
}

/** Applies one step to the model and returns the Store action for it. */
function stepAction(model: Model, state: StoreState, step: EditStep, now: () => Date): StoreAction {
  if (step.kind === "edit") {
    const action: StoreAction = { type: "edit", ops: [step.op] };
    // The generator tracks the engine's history, which also records no-op edits; the Store
    // does not, so after an undo an operation can be out of range for the Store's Document.
    // The Store rejects it with a notice and the model skips it.
    modelEdit(model, step.op, reduce(state, action, now).state.notice !== null);
    return action;
  }
  if (step.kind === "undo") {
    modelMove(model, model.undoStack, model.redoStack);
    return { type: "undo" };
  }
  modelMove(model, model.redoStack, model.undoStack);
  return { type: "redo" };
}

function expectDeclaration(
  model: Model,
  beforeIds: ReadonlySet<number>,
  before: Declaration | null,
  after: Declaration | null,
): void {
  const addedPasted = model.cells.some((c) => c.pasted && !beforeIds.has(c.id));
  const substantive = model.cells.some((c) => c.pasted && NON_SPACE.test(c.unit));
  if (addedPasted || before === null) {
    expect(after).toBeNull();
  } else if (before.subject === "pasted_text" && !substantive) {
    expect(after).toBeNull();
  } else {
    expect(after).toEqual(before);
  }
}

function runScenario(scenario: {
  doc: Document;
  declaration: Declaration;
  steps: readonly EditStep[];
}): void {
  const clock = createManualClock();
  let state = initialState(scenario.doc, scenario.declaration);
  const model: Model = { cells: [], undoStack: [], redoStack: [], counter: 0 };
  model.cells = cellsOf(scenario.doc, nextIdOf(model));
  for (const step of scenario.steps) {
    // Beyond the coalescing window, so every edit is its own Undo_Group.
    clock.advance(5000);
    const beforeIds = new Set(model.cells.map((c) => c.id));
    const before = state.declaration;
    const action = stepAction(model, state, step, clock.now);
    state = reduce(state, action, clock.now).state;
    expect(state.document.text).toBe(textOf(model.cells));
    expectDeclaration(model, beforeIds, before, state.declaration);
  }
}

describe("Property 4: a stored Declaration is cleared exactly when pasted text is added or none remains _Requirements: 5.3, 5.6, 5.7, 5.12, 11.5_", () => {
  // Property 4
  it("P4 the stored Declaration is null on new PST, null on no substantive PST for pasted_text, else unchanged", () => {
    fc.assert(fc.property(arbScenario, runScenario), { numRuns: runs() });
  });
});
