/**
 * The reference of Property 18, computed with a plain dynamic program over two line arrays.
 * It does not use `diffLines`, `trim.ts` or `update.ts`.
 */

/** The lines of `text`: each ends after a line feed and includes it; the last may have none. */
export function splitLines(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") {
      out.push(text.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < text.length) out.push(text.slice(start));
  return out;
}

export type LineReference = {
  /** Length of a longest common subsequence of the old and new lines. */
  lcs: number;
  /** `changed[j]`: some longest common subsequence match leaves new line `j` unmatched. */
  changed: boolean[];
  /** `possible(i, j)`: the lines are equal and some longest common subsequence match pairs them. */
  possible: (i: number, j: number) => boolean;
};

/** `t[i][j]`: LCS length of `a[i..]` and `b[j..]`. */
function suffixTable(a: readonly string[], b: readonly string[]): number[][] {
  const t = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      const row = t[i] as number[];
      const next = t[i + 1] as number[];
      row[j] =
        a[i] === b[j]
          ? (next[j + 1] as number) + 1
          : Math.max(next[j] as number, row[j + 1] as number);
    }
  }
  return t;
}

const reversed = (xs: readonly string[]): string[] => [...xs].reverse();

export function lineReference(
  oldLines: readonly string[],
  newLines: readonly string[],
): LineReference {
  const n = oldLines.length;
  const m = newLines.length;
  const suf = suffixTable(oldLines, newLines);
  // pre[i][j] is the LCS of the first i old lines and the first j new lines, read from the
  // table of the reversed arrays: its suffix starting at (n - i, m - j).
  const rev = suffixTable(reversed(oldLines), reversed(newLines));
  const pre = (i: number, j: number): number => (rev[n - i] as number[])[m - j] as number;
  const after = (i: number, j: number): number => (suf[i] as number[])[j] as number;
  const lcs = after(0, 0);
  const changed = newLines.map((_, j) => {
    let without = 0;
    for (let i = 0; i <= n; i++) without = Math.max(without, pre(i, j) + after(i, j + 1));
    return without === lcs;
  });
  const possible = (i: number, j: number): boolean =>
    oldLines[i] === newLines[j] && pre(i, j) + 1 + after(i + 1, j + 1) === lcs;
  return { lcs, changed, possible };
}
