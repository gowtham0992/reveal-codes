import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { filterOrders } from "../src/order-filter.js";
import { arbFilterState, arbOrderEntries } from "./support/arb-order-filter.js";
import { runs } from "./support/arbitraries.js";

/** Lower-case, then keep only letters and digits. Spelled here on purpose; not the source's function. */
function fold(text: string): string {
  return Array.from(text.toLowerCase())
    .filter((ch) => /\p{L}|\p{N}/u.test(ch))
    .join("");
}

describe("filterOrders _Requirements: 6.4, 6.8_", () => {
  // Property 1
  // Feature: court-rules-page, Property 1: The filter selects exactly the entries the rule names
  it("P1 selects exactly the entries the rule names, in input order", () => {
    fc.assert(
      fc.property(
        arbOrderEntries.chain((entries) =>
          arbFilterState(entries).map((state) => ({ entries, state })),
        ),
        ({ entries, state }) => {
          const needle = fold(state.query);
          const expected = entries.filter(
            (e) =>
              (e.status === "current" || state.showInactive) &&
              (state.kind === "all" || state.kind === e.kind) &&
              (needle === "" ||
                fold(e.court.name).includes(needle) ||
                fold(e.court.abbreviation).includes(needle) ||
                (e.judge !== null && fold(e.judge.name).includes(needle))),
          );
          const actual = filterOrders(entries, state);
          expect(actual.map((e) => e.id)).toEqual(expected.map((e) => e.id));

          if (state.query === "" && state.kind === "all" && !state.showInactive) {
            expect(actual.map((e) => e.id)).toEqual(
              entries.filter((e) => e.status === "current").map((e) => e.id),
            );
          }
        },
      ),
      { numRuns: runs() },
    );
  });
});
