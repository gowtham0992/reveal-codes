/**
 * `arbBoundaryText` (design Property 15; Req 8.3 to 8.6, 8.10, 22.1): an
 * `arbTextWithCitations` text with up to three prose pieces spliced in at
 * single spaces (or at the end): `arbAbbreviationProse` (the non-reporter
 * Legal_Abbreviations), `arbReporterAbbreviationProse` (reporter
 * abbreviations ending in `.`), and `arbInitialProse`. Every recorded
 * Offset is shifted to the spliced text, never computed by the Engine.
 * Built only from fast-check combinators, so values shrink.
 */
import fc from "fast-check";
import { REPORTER_ABBREVIATIONS } from "../citations/reporters.js";
import { arbInitialProse, type InitialOccurrence } from "./arb-initial-prose.js";
import { arbTextWithCitations } from "./arb-text-citations.js";
import {
  arbAbbreviationProse,
  arbCapitalisedWord,
  type AbbreviationOccurrence,
  type AbbreviationProse,
} from "./arb-text.js";

/** The spliced text and every recorded abbreviation and initial occurrence in it. */
export type BoundaryText = Readonly<{
  text: string;
  abbreviations: readonly AbbreviationOccurrence[];
  initials: readonly InitialOccurrence[];
}>;

type Piece = Readonly<{
  text: string;
  abbreviations: readonly AbbreviationOccurrence[];
  initials: readonly InitialOccurrence[];
}>;

const lower = fc.integer({ min: 0x61, max: 0x7a }).map((u) => String.fromCharCode(u));
const arbLowerWord = fc.array(lower, { minLength: 1, maxLength: 8 }).map((cs) => cs.join(""));

type ReporterFragment = Readonly<{ word: string } | { abbreviation: string; next: string }>;

/**
 * Lower-case words and `<reporter abbreviation> <Capitalised word>` pairs
 * joined by single spaces, each abbreviation's range recorded. Only
 * reporter entries that end in `.` are drawn (the ones Req 8.6 tests).
 */
export const arbReporterAbbreviationProse: fc.Arbitrary<AbbreviationProse> = fc
  .array(
    fc.oneof(
      arbLowerWord.map((word): ReporterFragment => ({ word })),
      fc
        .tuple(fc.constantFrom(...REPORTER_ABBREVIATIONS), arbCapitalisedWord)
        .map(([abbreviation, next]): ReporterFragment => ({ abbreviation, next })),
    ),
    { maxLength: 12 },
  )
  .map((fragments) => {
    const abbreviations: AbbreviationOccurrence[] = [];
    const parts: string[] = [];
    let at = 0;
    for (const f of fragments) {
      if (parts.length > 0) at += 1;
      const piece = "word" in f ? f.word : `${f.abbreviation} ${f.next}`;
      if (!("word" in f))
        abbreviations.push({
          abbreviation: f.abbreviation,
          start: at,
          end: at + f.abbreviation.length,
        });
      parts.push(piece);
      at += piece.length;
    }
    return { text: parts.join(" "), abbreviations };
  });

const fromAbbreviations = (p: AbbreviationProse): Piece => ({ ...p, initials: [] });

/** One optional piece and the draw that picks where it goes. */
const arbPlacedPiece = (
  arb: fc.Arbitrary<Piece>,
): fc.Arbitrary<{ piece: Piece; pick: number } | null> =>
  fc.option(fc.record({ piece: arb.filter((p) => p.text.length > 0), pick: fc.nat() }), {
    nil: null,
  });

/** The Offsets a piece may go to: each single space of `base`, and its end. */
function insertionPoints(base: string): number[] {
  const points: number[] = [];
  for (let k = 0; k < base.length; k += 1) if (base[k] === " ") points.push(k);
  points.push(base.length);
  return points;
}

/**
 * Writes `base` with each piece inserted at its point as `" " + piece`, so
 * every piece is preceded by a space (or starts the text when `base` is
 * empty) and followed by a space or the end. Occurrence Offsets are shifted.
 */
function splice(base: string, placed: readonly { piece: Piece; at: number }[]): BoundaryText {
  const sorted = [...placed].sort((x, y) => x.at - y.at);
  const abbreviations: AbbreviationOccurrence[] = [];
  const initials: InitialOccurrence[] = [];
  let text = "";
  let from = 0;
  for (const { piece, at } of sorted) {
    text += base.slice(from, at);
    if (text.length > 0) text += " ";
    const shift = text.length;
    for (const a of piece.abbreviations)
      abbreviations.push({ ...a, start: a.start + shift, end: a.end + shift });
    for (const o of piece.initials)
      initials.push({ ...o, dot: o.dot + shift, after: o.after + shift });
    text += piece.text;
    from = at;
  }
  return { text: text + base.slice(from), abbreviations, initials };
}

/** `arbTextWithCitations` text with the three prose pieces possibly spliced in. */
export const arbBoundaryText: fc.Arbitrary<BoundaryText> = fc
  .record({
    base: arbTextWithCitations.map((t) => t.text),
    abbr: arbPlacedPiece(arbAbbreviationProse.map(fromAbbreviations)),
    reporter: arbPlacedPiece(arbReporterAbbreviationProse.map(fromAbbreviations)),
    initial: arbPlacedPiece(arbInitialProse.map((p): Piece => ({ ...p, abbreviations: [] }))),
  })
  .map(({ base, abbr, reporter, initial }) => {
    const points = insertionPoints(base);
    const placed = [abbr, reporter, initial].flatMap((p) =>
      p === null ? [] : [{ piece: p.piece, at: points[p.pick % points.length] ?? base.length }],
    );
    return splice(base, placed);
  });
