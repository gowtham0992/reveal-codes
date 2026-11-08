export const MAX_LINES = 60;
export const MAX_BODY_CHARS = 64_000;

export type Chunk = Readonly<{ lines: readonly string[]; oversize: boolean }>;

/**
 * Greedy, in order (A2). Every non-oversize chunk has at most 60 lines and a
 * joined body of at most 64 000 characters. A line that alone exceeds the cap
 * is a chunk of its own with `oversize: true`. Concatenating the chunks gives
 * the input back (Req 7.2, 7.7).
 */
export function chunkLines(lines: readonly string[]): readonly Chunk[] {
  const chunks: Chunk[] = [];
  let cur: string[] = [];
  let size = 0;
  const flush = (): void => {
    if (cur.length > 0) chunks.push({ lines: cur, oversize: false });
    cur = [];
    size = 0;
  };
  for (const line of lines) {
    if (line.length > MAX_BODY_CHARS) {
      flush();
      chunks.push({ lines: [line], oversize: true });
      continue;
    }
    const added = cur.length === 0 ? line.length : size + 1 + line.length;
    if (cur.length === MAX_LINES || added > MAX_BODY_CHARS) flush();
    size = cur.length === 0 ? line.length : size + 1 + line.length;
    cur.push(line);
  }
  flush();
  return chunks;
}
