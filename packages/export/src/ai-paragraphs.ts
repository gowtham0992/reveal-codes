import type { Document } from "@reveal-codes/engine";
import { isAiSpan } from "./statement-parts.js";

/** Inclusive, 1-based range of Filing_Paragraph indexes. */
export type ParagraphRange = Readonly<{ from: number; to: number }>;

/** Start offset of every paragraph: 0, then the index after each "\n". */
function paragraphStarts(text: string): readonly number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

/** Greatest k with starts[k] <= offset. */
function paragraphAt(starts: readonly number[], offset: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((starts[mid] ?? 0) <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function markSpan(
  marks: Set<number>,
  starts: readonly number[],
  textLength: number,
  spanStart: number,
  spanEnd: number,
): void {
  for (let k = paragraphAt(starts, spanStart); k < starts.length; k += 1) {
    const from = starts[k] ?? 0;
    if (from >= spanEnd) break;
    // The terminating "\n" is not part of the paragraph (D18).
    const to = k + 1 < starts.length ? (starts[k + 1] ?? 0) - 1 : textLength;
    if (Math.max(spanStart, from) < Math.min(spanEnd, to)) marks.add(k + 1);
  }
}

/** Paragraphs (split on "\n") overlapped by an AI or AI>HUM span, merged into ranges. */
export function aiParagraphRanges(document: Document): readonly ParagraphRange[] {
  const starts = paragraphStarts(document.text);
  const marks = new Set<number>();
  for (const span of document.spans) {
    if (!isAiSpan(span) || span.start >= span.end) continue;
    markSpan(marks, starts, document.text.length, span.start, span.end);
  }
  const sorted = [...marks].sort((a, b) => a - b);
  const out: ParagraphRange[] = [];
  for (const n of sorted) {
    const last = out[out.length - 1];
    if (last !== undefined && last.to + 1 === n) out[out.length - 1] = { from: last.from, to: n };
    else out.push({ from: n, to: n });
  }
  return out;
}

/** `27`, `12–14` (en dash), joined by ", "; "" for no ranges. */
export function formatRanges(ranges: readonly ParagraphRange[]): string {
  return ranges
    .map((r) => (r.from === r.to ? String(r.from) : `${String(r.from)}\u2013${String(r.to)}`))
    .join(", ");
}
