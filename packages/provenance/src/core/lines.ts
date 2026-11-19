/**
 * Lines of a text (design M1, Req 1.3, 4.2). A line ends after `\n`; a `\r`
 * stays with its line, so a Surrogate_Pair is never split. Pure; no `node:`.
 */

/** A 1-based line and a 1-based column counted in UTF-16 code units. */
export type LinePosition = { line: number; column: number };

/** Offsets of the first character of each line; the text length is not included. */
export type LineIndex = { starts: readonly number[]; length: number };

/** The lines of `text`, each with its terminator. Empty text has no line. */
export function splitLines(text: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", from)) {
    out.push(text.slice(from, i + 1));
    from = i + 1;
  }
  if (from < text.length) out.push(text.slice(from));
  return out;
}

/**
 * Start offsets of the lines of `text`. The first is 0; one more follows every
 * `\n`, so a position at the very end of text that ends in `\n` is on its own line.
 */
export function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) {
    starts.push(i + 1);
  }
  return starts;
}

/** Builds the index once so many offsets can be converted by binary search. */
export function createLineIndex(text: string): LineIndex {
  return { starts: lineStarts(text), length: text.length };
}

/**
 * The 1-based line and column of `offset`. The column counts UTF-16 code units,
 * so a position after a Surrogate_Pair is two units further than before it.
 * An offset outside `[0, length]` is clamped.
 */
export function positionAt(index: LineIndex, offset: number): LinePosition {
  const at = Math.min(Math.max(offset, 0), index.length);
  let lo = 0;
  let hi = index.starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((index.starts[mid] ?? 0) <= at) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, column: at - (index.starts[lo] ?? 0) + 1 };
}
