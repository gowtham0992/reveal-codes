/** 1-based line of `offset` in `text`: 1 plus the number of "\n" before it. */
export function lineAt(text: string, offset: number): number {
  let count = 1;
  const end = Math.min(offset, text.length);
  for (let i = 0; i < end; i += 1) {
    if (text[i] === "\n") count += 1;
  }
  return count;
}

/** 1-based number of the first line, split on "\n", at which the two texts differ; null when equal. */
export function firstDifferingLine(a: string, b: string): number | null {
  if (a === b) return null;
  const left = a.split("\n");
  const right = b.split("\n");
  const longest = Math.max(left.length, right.length);
  for (let i = 0; i < longest; i += 1) {
    if (left[i] !== right[i]) return i + 1;
  }
  return null;
}
