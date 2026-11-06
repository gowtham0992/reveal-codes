/**
 * Neutral insertion positions for Property 24 (design D4, task 5.34).
 *
 * A neutral position is the start of a word that follows exactly one space
 * after another word, and lies outside every citation, every quote, and every
 * quote-to-citation gap, including the gap of a Quotation_Pair that attaches
 * to nothing. Ranges come from the generator's recorded
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

const QUOTE_MARKS = new Set(['"', "\u201C", "\u201D"]);

/**
 * The Req 13.1 gap of every Quotation_Pair, attached or not: from each
 * quotation mark up to the first later Full_Citation or Short_Form, ends
 * included. Every mark is treated as a possible closing mark, and Other
 * References are skipped, so this is a superset of the true gaps. Spaces in
 * the gap of a pair that attaches to nothing can create an attachment (D4):
 * `"…" See also See A, Inc. v. B, 1 A. 1` attaches nothing (D21), but with
 * spaces between `See` and `also` the quote attaches through `also See A,
 * Inc. v. B,`. Seed 26608700 found this (p24-seed-26608700.ts).
 */
function pairGaps(text: string, expected: Extraction): Blocked[] {
  const starts = expected.citations
    .filter((c) => c.value.kind !== "other")
    .map((c) => c.start)
    .sort((a, b) => a - b);
  const out: Blocked[] = [];
  for (let m = 0; m < text.length; m++) {
    if (!QUOTE_MARKS.has(text.charAt(m))) continue;
    const next = starts.find((s) => s > m);
    if (next !== undefined) out.push({ start: m, end: next, closed: true });
  }
  return out;
}

/** Every range a neutral position must stay out of. */
function blocked(text: string, expected: Extraction): Blocked[] {
  const inner = [...expected.citations, ...expected.quotes].map((r) => ({
    start: r.start,
    end: r.end,
    closed: false,
  }));
  return [...inner, ...gaps(expected), ...pairGaps(text, expected)];
}

const isWordStart = (text: string, p: number): boolean =>
  p >= 2 && text[p - 1] === " " && text[p] !== " " && text[p - 2] !== " ";

const inside = (p: number, b: Blocked): boolean =>
  b.closed ? b.start <= p && p <= b.end : b.start < p && p < b.end;

/** Offsets at which a word may be inserted between two words without touching any range. */
export function neutralPositions(text: string, expected: Extraction): number[] {
  const ranges = blocked(text, expected);
  const out: number[] = [];
  for (let p = 2; p < text.length; p++) {
    if (isWordStart(text, p) && !ranges.some((b) => inside(p, b))) out.push(p);
  }
  return out;
}
