// Linear-time substring search helpers (design A8, A9).

/** KMP failure table: `fail[i]` is the length of the longest proper border of `p[0..i]`. */
function failureTable(p: string): number[] {
  const fail: number[] = new Array<number>(p.length).fill(0);
  let k = 0;
  for (let i = 1; i < p.length; i += 1) {
    while (k > 0 && p[i] !== p[k]) k = fail[k - 1] as number;
    if (p[i] === p[k]) k += 1;
    fail[i] = k;
  }
  return fail;
}

/** Index of the first occurrence of `pattern` in `text` at or after `from`, or -1. */
export function indexFrom(pattern: string, text: string, from: number): number {
  const start = Math.max(0, from);
  if (pattern.length === 0) return start <= text.length ? start : -1;
  const fail = failureTable(pattern);
  let k = 0;
  for (let i = start; i < text.length; i += 1) {
    while (k > 0 && text[i] !== pattern[k]) k = fail[k - 1] as number;
    if (text[i] === pattern[k]) k += 1;
    if (k === pattern.length) return i - pattern.length + 1;
  }
  return -1;
}

/**
 * Length of the longest prefix of `pattern` that occurs in `text` at or after `from`.
 * Runs the KMP automaton over the text and keeps the largest state reached.
 */
export function longestPrefixOccurring(pattern: string, text: string, from: number): number {
  if (pattern.length === 0) return 0;
  const fail = failureTable(pattern);
  let k = 0;
  let best = 0;
  for (let i = Math.max(0, from); i < text.length; i += 1) {
    while (k > 0 && (k === pattern.length || text[i] !== pattern[k])) k = fail[k - 1] as number;
    if (text[i] === pattern[k]) k += 1;
    if (k > best) best = k;
    if (best === pattern.length) return best;
  }
  return best;
}
