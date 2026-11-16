import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { initialState, reduce, type StoreAction, type StoreState } from "../src/store";
import { arbHistoryPlan } from "./arbitraries";
import { createManualClock } from "./support/clock";
import { runs } from "./support/fc";

describe("Property 3: undo restores exactly _Requirements: 8.5, 8.6, 8.11_", () => {
  // Property 3
  it("undo to empty restores the start; redo to empty restores the pre-undo Document", () => {
    fc.assert(
      fc.property(arbHistoryPlan, ({ start, actions, gaps }) => {
        const clock = createManualClock();
        let state: StoreState = { ...initialState(clock.now), document: start };
        const step = (action: StoreAction): void => {
          state = reduce(state, action, clock.now).state;
        };
        actions.forEach((ops, i) => {
          clock.advance(gaps[i] ?? 0);
          step({ type: "edit", ops });
        });
        const before = state.document;
        expect(state.undo.length).toBeLessThanOrEqual(actions.length);

        while (state.undo.length > 0) {
          const depth = state.undo.length;
          step({ type: "undo" });
          expect(state.undo.length).toBe(depth - 1);
        }
        expect(state.document).toEqual(start);

        while (state.redo.length > 0) {
          const depth = state.redo.length;
          step({ type: "redo" });
          expect(state.redo.length).toBe(depth - 1);
        }
        expect(state.document).toEqual(before);
      }),
      { numRuns: runs() },
    );
  });
});
