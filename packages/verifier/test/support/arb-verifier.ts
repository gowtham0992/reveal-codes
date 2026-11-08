import * as fc from "fast-check";
import { format } from "@reveal-codes/engine";
// The engine's `testing/` folder is deliberately not exported from its index (engine Req 1.2).
import { arbReporterValue } from "../../../engine/src/testing/arb-citation";

/** A pincite-free Citation_Line built from the engine's `arbReporterValue`. */
export const arbCitationLine: fc.Arbitrary<string> = arbReporterValue.chain((v) => {
  const r = format({ kind: "reporter", volume: v.volume, reporter: v.reporter, page: v.page });
  return r.ok ? fc.constant(r.value) : fc.constant("1 U.S. 1");
});

/** A line over 64 000 characters; the repeat count is shrinkable, the first character keeps lines distinct. */
export const arbVeryLongLine: fc.Arbitrary<string> = fc
  .tuple(fc.integer({ min: 64_001, max: 70_000 }), fc.nat({ max: 9 }))
  .map(([n, d]) => String(d).repeat(n));

/** A line of 10 000 to 40 000 characters, so joined bodies approach the 64 000 cap. */
export const arbBulkyLine: fc.Arbitrary<string> = fc
  .tuple(fc.integer({ min: 10_000, max: 40_000 }), fc.nat({ max: 9 }))
  .map(([n, d]) => String(d).repeat(n));

/** Lists of distinct Citation_Lines with occasional bulky and over-64 000 lines (Property 4). */
export const arbChunkInput: fc.Arbitrary<string[]> = fc.uniqueArray(
  fc.oneof(
    { weight: 20, arbitrary: arbCitationLine },
    { weight: 2, arbitrary: arbBulkyLine },
    { weight: 1, arbitrary: arbVeryLongLine },
  ),
  { minLength: 0, maxLength: 200 },
);

/** Fragments that stress each stage of the Normalisation_Pipeline (Property 7). */
const normalisableFragment: fc.Arbitrary<string> = fc.oneof(
  { weight: 6, arbitrary: fc.string({ unit: "grapheme-ascii", maxLength: 6 }) },
  {
    weight: 6,
    arbitrary: fc.constantFrom("“", "”", "‘", "’", "‚", "–", "—", "[", "]", "[...]", ".[.]."),
  },
  { weight: 6, arbitrary: fc.constantFrom(".", "..", "...", ". . .", "…", ",", ";", ":") },
  {
    weight: 5,
    arbitrary: fc.constantFrom("\t", "\u0085", "\u00a0", "\ufeff", "\u2028", "\u3000", " ", "\n"),
  },
  { weight: 3, arbitrary: fc.constantFrom("\u0300", "\u0301", "\u0323", "e\u0301", "a\u0308") },
  { weight: 2, arbitrary: fc.constantFrom("\ud800", "\udc00", "\ud83d\ude00", "\ud83d") },
  { weight: 2, arbitrary: fc.constantFrom("\u1100", "\u1161", "\u11a8", "\uac00", "\u1100\u1161") },
  { weight: 1, arbitrary: fc.constantFrom("İ", "ǅ", "ß", "Σ") },
);

/** Strings built from pipeline-relevant fragments (Property 7). */
export const arbNormalisable: fc.Arbitrary<string> = fc
  .array(normalisableFragment, { maxLength: 14 })
  .map((parts) => parts.join(""));
