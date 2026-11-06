/**
 * Property 20 inputs (task 5.24): an `arbTextWithCitations` text with
 * `arbQuoteNoise` pieces (stray, unterminated, mixed, empty, nested, and
 * crossing marks) inserted outside its citation ranges, and the Offset map
 * from the noise-free text. Kept here so extract.properties.test.ts stays
 * under the 300-line module limit.
 */
import fc from "fast-check";
import {
  arbQuoteNoise,
  arbTextWithCitations,
  type TextWithCitations,
} from "../../src/testing/arbitraries";
import type { ExtractedCitation } from "../../src/types";

/** The noise-free text, the noisy text, and the Offset map between them. */
export type Noisy = Readonly<{ base: string; text: string; shift: (x: number) => number }>;

/**
 * Offsets `0..n` where `piece` may go: not strictly inside any citation
 * range, and not right before an `Id.` when `piece` ends with the closing
 * mark `”`, because Req 12.1 reads no `Id.` after closing punctuation (see
 * the seed -341920749 example in extract.properties.test.ts).
 */
function insertionPoints(v: TextWithCitations, piece: string): number[] {
  const out: number[] = [];
  for (let p = 0; p <= v.text.length; p++) {
    const inside = v.expected.citations.some((c) => c.start < p && p < c.end);
    const beforeId = v.expected.citations.some(
      (c) => c.start === p && c.value.kind === "short" && c.value.form === "id",
    );
    if (!inside && !(beforeId && piece.endsWith("”"))) out.push(p);
  }
  return out;
}

/** Inserts each piece at its Offset; pieces at one Offset keep their order. */
function insertNoise(v: TextWithCitations, pieces: readonly string[], picks: number[]): Noisy {
  const at = pieces
    .map((piece, i) => {
      const points = insertionPoints(v, piece);
      return { piece, p: points[(picks[i] ?? 0) % points.length] ?? 0 };
    })
    .sort((a, b) => a.p - b.p);
  let text = "";
  let cursor = 0;
  for (const { piece, p } of at) {
    text += v.text.slice(cursor, p) + piece;
    cursor = p;
  }
  text += v.text.slice(cursor);
  const shift = (x: number): number =>
    x + at.filter(({ p }) => p <= x).reduce((n, { piece }) => n + piece.length, 0);
  return { base: v.text, text, shift };
}

/** A constructed citing text with one to six noise pieces inserted. */
export const arbNoisyText: fc.Arbitrary<Noisy> = fc
  .tuple(arbTextWithCitations, arbQuoteNoise, fc.array(fc.nat(), { minLength: 6, maxLength: 6 }))
  .map(([v, pieces, picks]) => insertNoise(v, pieces, picks));

/** A noise-free citation moved by `shift`, including a Short_Form's `targetStart`. */
export function shifted(c: ExtractedCitation, shift: (x: number) => number): ExtractedCitation {
  const start = shift(c.start);
  const moved = { ...c, start, end: start + (c.end - c.start) };
  if (c.value.kind !== "short" || c.value.targetStart === null) return moved;
  return { ...moved, value: { ...c.value, targetStart: shift(c.value.targetStart) } };
}
