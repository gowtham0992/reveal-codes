/**
 * `sentenceIndex` for Property 44: the index of the Sentence holding an
 * Offset, found by scanning the Segmenter's own output over one span.
 */
import { segment } from "../../src/segment";
import type { Sentence, Span } from "../../src/types";

const oneSpan = (text: string): Span[] => [
  { start: 0, end: text.length, provenance: { origin: "HUM", timestamp: "2026-01-01T00:00:00Z" } },
];

/** The Sentences of `text` under one `HUM` span; throws if `segment` errs. */
export function sentencesOf(text: string): readonly Sentence[] {
  const r = segment(text, oneSpan(text));
  if (!r.ok) throw new Error(`segment failed: ${r.error.kind}`);
  return r.value;
}

/** Index of the Sentence in `sentences` with `start ≤ x < end`, or -1. */
export function sentenceIndex(sentences: readonly Sentence[], x: number): number {
  return sentences.findIndex((s) => s.start <= x && x < s.end);
}
