// Brute-force model of prefixLength (design A9 definition): no shortcut, no budget.

import { foldCase, normalise, normaliseQuote, pipeline } from "../../src/normalise";
import { matchSegments, splitSegments } from "../../src/segments";

/** Largest n in [0, L) whose normalised prefix has a segment and matches in order. */
export function modelPrefixLength(quote: string, opinionText: string): number {
  const opinion = normalise(opinionText);
  const single = splitSegments(normaliseQuote(quote)).length === 1;
  for (let n = quote.length - 1; n >= 1; n -= 1) {
    const prefix = quote.slice(0, n);
    const normal = single ? normaliseQuote(prefix) : foldCase(pipeline(prefix));
    const segs = splitSegments(normal);
    if (segs.length >= 1 && matchSegments(opinion, segs).ok) return n;
  }
  return 0;
}
