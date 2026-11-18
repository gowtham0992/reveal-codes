import type { Document, QuoteRecord } from "@reveal-codes/engine";

const MAX_WORDS = 6;

type Word = Readonly<{ index: number; text: string }>;

function wordsOf(text: string): Word[] {
  return [...text.matchAll(/\S+/g)].map((m) => ({ index: m.index, text: m[0] }));
}

/** Position of the first word to show: the word holding `at`, else the next one, else the last. */
function firstWordIndex(words: readonly Word[], at: number): number {
  const holding = words.findIndex((w) => w.index <= at && at < w.index + w.text.length);
  if (holding >= 0) return holding;
  const next = words.findIndex((w) => w.index >= at);
  return next >= 0 ? next : words.length - 1;
}

/**
 * Words of `quoteText` from the word containing code unit `prefixLength`, at most six, joined by
 * single spaces; a trailing "…" when more words remain (Requirements 13.6, 18.11).
 */
export function divergenceWords(quoteText: string, prefixLength: number): string {
  const words = wordsOf(quoteText);
  if (words.length === 0) return "";
  const first = firstWordIndex(words, prefixLength);
  const shown = words.slice(first, first + MAX_WORDS).map((w) => w.text);
  const more = first + MAX_WORDS < words.length;
  return shown.join(" ") + (more ? "…" : "");
}

/**
 * The sentence the Issues row, the Check_Page result list and the Pane status show for a quotation
 * that differs from the opinion; "" when the quotation holds no word (Requirement 27, Decision 13).
 */
export function divergenceSentence(quoteText: string, prefixLength: number): string {
  const words = wordsOf(quoteText);
  if (words.length === 0) return "";
  const first = firstWordIndex(words, prefixLength);
  const differing = divergenceWords(quoteText, prefixLength);
  if (first === 0) return `Differs from the opinion from the first word: "${differing}"`;
  const tail = words
    .slice(Math.max(0, first - 3), first)
    .map((w) => w.text)
    .join(" ");
  const lead = first > 3 ? "… " : "";
  return `Matches the opinion up to "${lead}${tail}", then differs: "${differing}"`;
}

/** The QuoteRecord whose [start, end) holds `offset` and whose result is a mismatch, else null. */
export function mismatchAt(document: Document, offset: number): QuoteRecord | null {
  const found = document.quotes.find(
    (q) => q.result.status === "mismatch" && q.quote.start <= offset && offset < q.quote.end,
  );
  return found ?? null;
}
