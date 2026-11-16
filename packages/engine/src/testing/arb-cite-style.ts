/**
 * The `pinciteStyle` option of the Full_Citation and Short_Form builders
 * (design "Arbitraries" paragraph of the pincite section; Req 18.10, 18.11).
 *
 * `"single"` returns the existing arbitraries themselves, so every property
 * that does not opt in keeps its domain and its generated values. `"expression"`
 * writes each pincite as an `arbPinciteExpression` (a database citation takes
 * `arbPinciteRange`, which has no list) and stores the first page in the value.
 */
import fc from "fast-check";
import { arbPinciteExpression, arbPinciteRange, withExpressions } from "./arb-pincite.js";
import { arbFullCite, arbIdCite, arbPartyCite } from "./arb-quote-groups.js";
import type { FullCite, IdCite, PartyCite, PinciteStyle } from "./arb-text-builder.js";

/** A parallel citation has at most four members, each with its own pincite. */
const MAX_PINCITES = 4;

/** `arbFullCite`, with each pincite written as an expression when `style` is `"expression"`. */
export function arbFullCiteWith(style: PinciteStyle): fc.Arbitrary<FullCite> {
  if (style === "single") return arbFullCite;
  return fc
    .tuple(
      arbFullCite,
      fc.array(arbPinciteExpression, { minLength: MAX_PINCITES, maxLength: MAX_PINCITES }),
      arbPinciteRange,
    )
    .map(([c, exprs, range]): FullCite => {
      const w = withExpressions(c.value, exprs, range);
      return { kind: "full", value: w.value, text: w.text };
    });
}

/** `arbIdCite`, with `Id. at <expression>` when `style` is `"expression"`. */
export function arbIdCiteWith(style: PinciteStyle): fc.Arbitrary<IdCite> {
  if (style === "single") return arbIdCite;
  return fc
    .option(arbPinciteExpression)
    .map((e): IdCite =>
      e === null
        ? { kind: "id", pincite: null }
        : { kind: "id", pincite: e.first, pinciteText: e.text },
    );
}

/** `arbPartyCite`, with `at <expression>` when `style` is `"expression"`. */
export function arbPartyCiteWith(style: PinciteStyle): fc.Arbitrary<PartyCite> {
  if (style === "single") return arbPartyCite;
  return fc
    .tuple(arbPartyCite, arbPinciteExpression)
    .map(([c, e]): PartyCite => ({ ...c, pincite: e.first, pinciteText: e.text }));
}
