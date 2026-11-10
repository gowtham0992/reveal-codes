import type { Document } from "@reveal-codes/engine";
import { isAiSpan } from "./statement-parts.js";

/** One AI-drafted passage: its 1-based paragraph among non-empty paragraphs and its opening words. */
export type AiPassage = Readonly<{ paragraph: number; words: string }>;

const EXCERPT_WORDS = 8;

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

/** Start offsets of the paragraphs that hold at least one non-whitespace character. */
function nonEmptyStarts(text: string, starts: readonly number[]): readonly number[] {
  return starts.filter((from, k) => {
    const to = k + 1 < starts.length ? (starts[k + 1] ?? 0) - 1 : text.length;
    return text.slice(from, to).trim() !== "";
  });
}

type Run = Readonly<{ start: number; end: number }>;

/** Maximal runs of touching AI-origin spans (D21). */
function aiRuns(document: Document): readonly Run[] {
  const runs: Run[] = [];
  let open: Run | null = null;
  for (const span of document.spans) {
    if (!isAiSpan(span)) {
      if (open !== null) runs.push(open);
      open = null;
    } else if (span.start < span.end) {
      if (open !== null && open.end === span.start) open = { start: open.start, end: span.end };
      else {
        if (open !== null) runs.push(open);
        open = { start: span.start, end: span.end };
      }
    }
  }
  if (open !== null) runs.push(open);
  return runs;
}

/**
 * The AI-drafted passages in document order. A run with no non-whitespace character is not a
 * passage (D18). The paragraph number counts non-empty paragraphs only (D21).
 */
export function aiPassages(document: Document): readonly AiPassage[] {
  const { text } = document;
  const starts = paragraphStarts(text);
  const filled = nonEmptyStarts(text, starts);
  const out: AiPassage[] = [];
  for (const run of aiRuns(document)) {
    const slice = text.slice(run.start, run.end);
    if (slice.trim() === "") continue;
    const first = run.start + (slice.length - slice.trimStart().length);
    const paragraph = filled.indexOf(starts[paragraphAt(starts, first)] ?? 0) + 1;
    const words = slice.trim().split(/\s+/).slice(0, EXCERPT_WORDS).join(" ");
    out.push({ paragraph, words });
  }
  return out;
}
