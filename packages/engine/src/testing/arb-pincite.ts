/**
 * Pincite_Expression arbitraries (design "Arbitraries" paragraph of the
 * pincite section; Req 18.10, 18.11, 18.14). Re-exported from `arb-citation.ts`.
 *
 * - `arbPinciteExpression`: `{ text, first }` where `text` is a single page, a
 *   range (`-` or `–`, a full or shortened second number of one to five
 *   digits), or a list of two to five such items, at most 24 code units. A
 *   later item is never a four-digit number from 1600 to 2999, so no item can
 *   read as the start of a `WL` or `LEXIS` citation. A later item that would
 *   start a Parallel_Citation member cannot be generated: items are digits
 *   only, and a member needs a reporter after the volume.
 * - `arbPinciteRange`: a single page or a range, never a list (the form a
 *   Database_Citation accepts).
 * - `withExpressions`: writes a Full_Citation value with an expression in
 *   place of each pincite, returning the value (pincite = `first`) and its text.
 */
import fc from "fast-check";
import { format } from "../citations/format.js";
import { PINCITE_RANGE } from "../citations/lex.js";
import type { FullValue, ParallelValue, ReporterMember, ReporterValue } from "../types.js";

/** A Pincite_Expression as written and the page the value keeps. */
export type PinciteExpr = Readonly<{ text: string; first: number }>;

/** Longest expression the reader accepts, in code units. */
const MAX_EXPRESSION = 24;

const digit: fc.Arbitrary<string> = fc.integer({ min: 0, max: 9 }).map(String);

/** A second number: full (any pincite) or shortened (one or two digits, zeros allowed). */
const arbSecond: fc.Arbitrary<string> = fc.oneof(
  fc.integer({ min: PINCITE_RANGE.min, max: PINCITE_RANGE.max }).map(String),
  fc.string({ unit: digit, minLength: 1, maxLength: 2 }),
);

type Item = Readonly<{ page: number; tail: string }>;

const arbRangeTail: fc.Arbitrary<string> = fc
  .tuple(fc.constantFrom("-", "–"), arbSecond)
  .map(([dash, second]) => dash + second);

const arbPage: fc.Arbitrary<number> = fc.integer({
  min: PINCITE_RANGE.min,
  max: PINCITE_RANGE.max,
});

const arbPlainItem: fc.Arbitrary<Item> = arbPage.map((page) => ({ page, tail: "" }));

const arbRangeItem: fc.Arbitrary<Item> = fc
  .tuple(arbPage, arbRangeTail)
  .map(([page, tail]) => ({ page, tail }));

const arbItem: fc.Arbitrary<Item> = fc.oneof(arbPlainItem, arbRangeItem);

/** A later item: not a number a database citation could start with. */
const arbLaterItem: fc.Arbitrary<Item> = arbItem.filter((i) => i.page < 1600 || i.page > 2999);

const written = (i: Item): string => String(i.page) + i.tail;

/** Joins the items with `, ` and drops trailing items past 24 code units. */
function join(head: Item, rest: readonly Item[]): PinciteExpr {
  let text = written(head);
  for (const item of rest) {
    const next = `${text}, ${written(item)}`;
    if (next.length > MAX_EXPRESSION) break;
    text = next;
  }
  return { text, first: head.page };
}

/** A single page or a range, never a list. */
export const arbPinciteRange: fc.Arbitrary<PinciteExpr> = arbItem.map((i) => join(i, []));

/** A single page, a range, or a list of two to five items. */
export const arbPinciteExpression: fc.Arbitrary<PinciteExpr> = fc.oneof(
  arbPlainItem.map((i) => join(i, [])),
  arbRangeItem.map((i) => join(i, [])),
  fc
    .tuple(arbItem, fc.array(arbLaterItem, { minLength: 1, maxLength: 4 }))
    .map(([head, rest]) => join(head, rest)),
);

const core = (m: ReporterMember): string => `${String(m.volume)} ${m.reporter} ${String(m.page)}`;

const canonicalText = (value: FullValue): string => {
  const r = format(value);
  return r.ok ? r.value : "";
};

/** The members of a reporter or parallel value as written, with `texts[i]` as member i's pincite. */
function memberTexts(members: readonly ReporterMember[], texts: readonly string[]): string {
  return members
    .map((m, i) => (m.pincite === undefined ? core(m) : `${core(m)}, ${texts[i] ?? ""}`))
    .join(", ");
}

/** Replaces the pincite of every member that has one with the `i`-th expression. */
function withMemberExpressions(
  value: ReporterValue | ParallelValue,
  exprs: readonly PinciteExpr[],
): Readonly<{ value: FullValue; text: string }> {
  const members = value.kind === "reporter" ? [value] : value.members;
  const full = canonicalText(value);
  const canonicalMembers = memberTexts(
    members,
    members.map((m) => String(m.pincite ?? "")),
  );
  const suffix = full.slice(canonicalMembers.length);
  const next = members.map((m, i): ReporterMember => {
    const e = exprs[i];
    return m.pincite === undefined || e === undefined ? m : { ...m, pincite: e.first };
  });
  const text = memberTexts(
    next,
    members.map((_m, i) => exprs[i]?.text ?? ""),
  );
  const first = exprs[0];
  const out: FullValue =
    value.kind === "reporter"
      ? first === undefined || value.pincite === undefined
        ? value
        : { ...value, pincite: first.first }
      : { ...value, members: next };
  return { value: out, text: text + suffix };
}

/**
 * Writes `value` with a Pincite_Expression in place of each pincite: `exprs[i]`
 * for member `i`, and `range` for the pincite of a Database_Citation. The
 * returned value keeps each expression's first page. A value with no pincite
 * is returned as its Canonical_Form.
 */
export function withExpressions(
  value: FullValue,
  exprs: readonly PinciteExpr[],
  range: PinciteExpr,
): Readonly<{ value: FullValue; text: string }> {
  if (value.kind !== "database") return withMemberExpressions(value, exprs);
  const full = canonicalText(value);
  if (value.pincite === undefined) return { value, text: full };
  const head = full.slice(0, full.length - String(value.pincite).length);
  return { value: { ...value, pincite: range.first }, text: head + range.text };
}
