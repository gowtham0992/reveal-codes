/**
 * Property 50 inputs and checks (task 5.30; Req 9.2, 12.2; design P50).
 *
 * `t = prefix + l + x + r + tail` with `prefix = format(f) + ". "` and
 * `tail = ", " + f.volume + " " + f.reporter + " at " + pg`. The expected
 * party comes from the word-list model in `party-model.ts`.
 */
import fc from "fast-check";
import { expect } from "vitest";
import { extract } from "../../src/citations/extract";
import {
  arbCitation,
  arbLongParty,
  arbPartyLeftContext,
  arbShortFormParty,
  arbStopListPrefix,
  canonical,
} from "../../src/testing/arbitraries";
import type { ReporterValue } from "../../src/types";
import { modelParty, windowAgrees, type PartyModel } from "./party-model";

/** One Property 50 input. */
export type P50Input = Readonly<{
  prefix: string;
  l: string;
  x: string;
  r: string;
  tail: string;
  long: boolean;
}>;

/** The input's full text. */
export const p50Text = (i: P50Input): string => i.prefix + i.l + i.x + i.r + i.tail;

/** The text before the tail comma. */
export const p50Before = (i: P50Input): string => i.prefix + i.l + i.x + i.r;

/** A Property 50 input from its parts. */
export function p50Input(f: ReporterValue, l: string, x: string, r: string, pg: number): P50Input {
  const tail = `, ${String(f.volume)} ${f.reporter} at ${String(pg)}`;
  return { prefix: `${canonical(f)}. `, l, x, r, tail, long: false };
}

const arbR = fc.oneof(
  arbShortFormParty.map((r) => ({ r, long: false })),
  arbLongParty.map((r) => ({ r, long: true })),
);

export const arbP50Input: fc.Arbitrary<P50Input> = fc
  .record({
    l: arbPartyLeftContext,
    x: arbStopListPrefix,
    r: arbR,
    f: arbCitation.filter((c): c is ReporterValue => c.kind === "reporter"),
    pg: fc.integer({ min: 1, max: 99999 }),
  })
  .map(({ l, x, r, f, pg }) => ({ ...p50Input(f, l, x, r.r, pg), long: r.long }));

/** `[start, party, targetStart]` of every party Short_Form of `t`. */
export function partyForms(t: string): readonly (readonly [number, string, number | null])[] {
  return extract(t).citations.flatMap((k) =>
    k.value.kind === "short" && k.value.form === "party"
      ? [[k.start, k.value.party, k.value.targetStart] as const]
      : [],
  );
}

/** Property 50's two clauses for one input; returns the model's reading. */
export function expectModelParty(i: P50Input): PartyModel {
  const t = p50Text(i);
  const before = p50Before(i);
  const m = modelParty(before);
  expect({ t, m, window: windowAgrees(before, m) }).toEqual({ t, m, window: true });
  if (m.kind === "party") {
    expect({ t, got: partyForms(t) }).toEqual({ t, got: [[m.start, m.party, 0]] });
    return m;
  }
  expect({ t, m, got: partyForms(t) }).toEqual({ t, m, got: [] });
  const overlapping = extract(t).citations.filter((k) => k.end > i.prefix.length);
  expect({ t, m, overlapping }).toEqual({ t, m, overlapping: [] });
  return m;
}
