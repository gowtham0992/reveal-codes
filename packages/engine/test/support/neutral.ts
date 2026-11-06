/**
 * Neutral insertion positions for Property 24 (design D4, task 5.34).
 *
 * A neutral position is the start of a word that follows exactly one space
 * after another word, and lies outside every citation, every quote, and every
 * quote-to-citation gap. Ranges come from the generator's recorded
 * `expected` Extraction, never from `extract`. Kept here so
 * format.properties.test.ts stays under the 300-line module limit.
 */
import type { Extraction } from "../../src/types";

/** `[start, end]` with a flag for whether both ends are excluded too. */
type Blocked = Readonly<{ start: number; end: number; closed: boolean }>;

/** The gap between each attached quote and its citation, ends included. */
function gaps(expected: Extraction): Blocked[] {
  const out: Blocked[] = [];
  for (const q of expected.quotes) {
    const c = expected.citations.find((x) => x.start === q.citationStart);
    if (c === undefined) throw new Error(`quote at ${String(q.start)} has no citation`);
    out.push(
      q.rule === "preceding"
        ? { start: q.end, end: c.start, closed: true }
        : { start: c.end, end: q.start, closed: true },
    );
  }
  return out;
}

/** Every range a neutral position must stay out of. */
function blocked(expected: Extraction): Blocked[] {
  const inner = [...expected.citations, ...expected.quotes].map((r) => ({
    start: r.start,
    end: r.end,
    closed: false,
  }));
  return [...inner, ...gaps(expected)];
}

const isWordStart = (text: string, p: number): boolean =>
  p >= 2 && text[p - 1] === " " && text[p] !== " " && text[p - 2] !== " ";

const inside = (p: number, b: Blocked): boolean =>
  b.closed ? b.start <= p && p <= b.end : b.start < p && p < b.end;

/** Offsets at which a word may be inserted between two words without touching any range. */
export function neutralPositions(text: string, expected: Extraction): number[] {
  const ranges = blocked(expected);
  const out: number[] = [];
  for (let p = 2; p < text.length; p++) {
    if (isWordStart(text, p) && !ranges.some((b) => inside(p, b))) out.push(p);
  }
  return out;
}
