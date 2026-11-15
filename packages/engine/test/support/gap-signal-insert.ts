/**
 * Builders for Property 51 (task 5.46; Req 12.2, 13.1; design D19, D21).
 *
 * `t = '"' + q + '"' + p1 + m + x` and `t′` is `t` with `g + " "` inserted
 * before `m + x`. The expected quote is built from the construction: content
 * `[1, 1 + q.length)` and `citationStart = t′.length − x.length`. The Sentence
 * condition is read from `segment` (via `sentencesOf`). `extract(t)` is used
 * only where the statement uses it: the attachment precondition, and the
 * citations that `t′`'s citations must equal after the shift.
 *
 * D21: `g + " "` never joins what follows into a longer Gap_Signal. Every
 * longer Gap_Signal continues its shorter prefix with `,` or a lower-case
 * word (`See also`, `See, e.g.,`), while `m + x` starts with a Capitalised
 * Party_Name word (`arbCaseName`, `arbShortFormParty`) or a volume digit.
 * Kept here so extract.properties.test.ts stays under 300 lines.
 */
import fc from "fast-check";
import { expect } from "vitest";
import { extract } from "../../src/citations/extract";
import {
  arbCaseName,
  arbCitation,
  arbGapPunct,
  arbGapSignal,
  arbQuoteContent,
  arbShortFormParty,
  canonical,
} from "../../src/testing/arbitraries";
import type { FullValue, ReporterValue } from "../../src/types";
import { withoutCaseName } from "./expected";
import { shifted } from "./quote-noise";
import { sentenceIndex, sentencesOf } from "./sentence-index";

/** Which `m` and `x` a case uses: `f` alone, `n + p2` then `f`, or `y` alone. */
export type P51Shape = "f" | "nf" | "y";

/** The drawn pieces of one Property 51 case. */
export type P51Case = Readonly<{
  shape: P51Shape;
  q: string;
  p1: string;
  /** `p1` redrawn so it does not end with `.`, used only when `x = y`. */
  p1y: string;
  n: string;
  p2: string;
  c: FullValue;
  /** The reporter value `y` is built from (Property 45's `c`). */
  cy: ReporterValue;
  r: string;
  pg: number;
  g: string;
}>;

const isReporter = (v: { kind: string }): v is ReporterValue => v.kind === "reporter";

export const arbP51Case: fc.Arbitrary<P51Case> = fc.record({
  shape: fc.constantFrom<P51Shape>("f", "nf", "y"),
  q: arbQuoteContent,
  p1: arbGapPunct,
  p1y: arbGapPunct.filter((p) => !p.endsWith(".")),
  n: arbCaseName,
  p2: arbGapPunct,
  c: arbCitation,
  cy: arbCitation.filter(isReporter),
  r: arbShortFormParty,
  pg: fc.integer({ min: 1, max: 9999 }),
  g: arbGapSignal,
});

/** The pieces `p1`, `m`, `x` of a case. */
export function p51Parts(k: P51Case): Readonly<{ p1: string; m: string; x: string }> {
  if (k.shape === "y") {
    const y = `${k.r}, ${String(k.cy.volume)} ${k.cy.reporter} at ${String(k.pg)}`;
    return { p1: k.p1y, m: "", x: y };
  }
  return { p1: k.p1, m: k.shape === "nf" ? k.n + k.p2 : "", x: canonical(k.c) };
}

/** `t` and `t′` of a case, and `x`. */
export function p51Texts(k: P51Case): Readonly<{ t: string; t2: string; x: string }> {
  const { p1, m, x } = p51Parts(k);
  return { t: `"${k.q}"${p1}${m}${x}`, t2: `"${k.q}"${p1}${k.g} ${m}${x}`, x };
}

/** Which branch of Property 51 a case took; used by the non-vacuity sample. */
export type P51Branch = "no_attach_in_t" | "far_in_t2" | "checked";

/** Property 51 for one case; returns the branch it took. */
export function expectSignalKeepsAttachment(k: P51Case): P51Branch {
  const { t, t2, x } = p51Texts(k);
  const shift = k.g.length + 1;
  const base = extract(t);
  const got = extract(t2);
  expect({ t2, citations: got.citations.map(withoutCaseName) }).toEqual({
    t2,
    citations: base.citations.map((c) => withoutCaseName(shifted(c, (o) => o + shift))),
  });
  const xStart = t.length - x.length;
  const attached = base.quotes.some((q) => q.rule === "preceding" && q.citationStart === xStart);
  if (!attached) return "no_attach_in_t";
  const s = sentencesOf(t2);
  const xStart2 = t2.length - x.length;
  if (sentenceIndex(s, xStart2) - sentenceIndex(s, k.q.length + 1) > 1) return "far_in_t2";
  const want = { start: 1, end: 1 + k.q.length, text: k.q, citationStart: xStart2 };
  expect({ t2, quotes: got.quotes }).toEqual({ t2, quotes: [{ ...want, rule: "preceding" }] });
  return "checked";
}
