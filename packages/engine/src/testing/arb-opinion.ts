/**
 * `arbOpinionWithQuotes` (design "Arbitraries" table; Req 22.1, 22.4): an
 * opinion body of up to 20,000 code units of prose with 1 to 10 embedded
 * quotations, each recorded with the Offsets of its content (marks
 * excluded). Built from fast-check combinators only, so values shrink.
 *
 * Length bound: at most 80 sentences of at most 20 words of at most 10
 * letters (≤ 220 code units each with spaces and the `.`, plus one joining
 * space) and at most 10 quotations of at most 200 code units plus two marks
 * and one space: 80 × 221 + 10 × 203 = 19,710 ≤ 20,000.
 */
import fc from "fast-check";
import { arbQuoteContent } from "./arb-quote-parts.js";

/** Longest `arbOpinionWithQuotes` text. */
export const MAX_OPINION = 20_000;

/** One embedded quotation: its content range and text. */
export type OpinionQuotation = Readonly<{ start: number; end: number; text: string }>;

export type OpinionWithQuotes = Readonly<{
  text: string;
  quotations: readonly OpinionQuotation[];
}>;

const lowerLetter = fc.integer({ min: 0x61, max: 0x7a }).map((u) => String.fromCharCode(u));

const arbWord = fc.string({ unit: lowerLetter, minLength: 1, maxLength: 10 });

/** A sentence: capitalised first word, single spaces, final `.`. */
const arbSentence: fc.Arbitrary<string> = fc
  .array(arbWord, { minLength: 1, maxLength: 20 })
  .map((ws) => {
    const s = ws.join(" ");
    return `${s.charAt(0).toUpperCase()}${s.slice(1)}.`;
  });

type Insert = Readonly<{ at: number; content: string; curly: boolean }>;

const arbInsert: fc.Arbitrary<Insert> = fc.record({
  at: fc.nat(),
  content: arbQuoteContent,
  curly: fc.boolean(),
});

/** Places each quotation after sentence `at mod (n + 1)`, in a stable order. */
function assemble(sentences: readonly string[], inserts: readonly Insert[]): OpinionWithQuotes {
  const slots = sentences.length + 1;
  const byslot = [...inserts].map((q, i) => ({ q, i, slot: q.at % slots }));
  byslot.sort((x, y) => x.slot - y.slot || x.i - y.i);
  const pieces: string[] = [];
  const quotations: OpinionQuotation[] = [];
  let at = 0;
  const push = (s: string): void => {
    if (pieces.length > 0) at += 1;
    pieces.push(s);
    at += s.length;
  };
  let k = 0;
  for (let slot = 0; slot < slots; slot++) {
    for (; k < byslot.length && byslot[k]?.slot === slot; k++) {
      const q = byslot[k]?.q;
      if (q === undefined) continue;
      push((q.curly ? "“" : '"') + q.content + (q.curly ? "”" : '"'));
      quotations.push({ start: at - q.content.length - 1, end: at - 1, text: q.content });
    }
    const s = sentences[slot];
    if (s !== undefined) push(s);
  }
  return { text: pieces.join(" "), quotations };
}

/** Opinion prose with 1 to 10 recorded quotations. */
export const arbOpinionWithQuotes: fc.Arbitrary<OpinionWithQuotes> = fc
  .tuple(
    fc.array(arbSentence, { maxLength: 80 }),
    fc.array(arbInsert, { minLength: 1, maxLength: 10 }),
  )
  .map(([sentences, inserts]) => assemble(sentences, inserts));
