/**
 * Sentence segmentation (design A8, Req 8). Lossless: Sentences tile
 * [0, text.length) exactly, and whitespace after a terminator belongs to the
 * preceding Sentence. Boundaries come from the one shared predicate in
 * `boundary.ts`. `segmentWith` takes citation ranges as a parameter; the
 * public `segment(text, spans)` passes `extract(text).citations`, the same
 * list quote attachment counts boundaries against (Req 8.5).
 */
import { isBoundaryAt, type CitationRange } from "./boundary.js";
import { extract } from "./citations/extract.js";
import type { EngineError } from "./errors.js";
import { err, ok, type Result } from "./result.js";
import { checkCoverage } from "./spans.js";
import type { Origin, Sentence, Span } from "./types.js";

/** The fixed order of `Sentence.origins`. */
const ORIGIN_ORDER: readonly Origin[] = ["HUM", "PST", "AI", "AI>HUM"];

const WHITESPACE = /\s/;
const isWhitespace = (unit: string): boolean => unit.length > 0 && WHITESPACE.test(unit);

/**
 * Every Sentence boundary in ascending order, in one forward pass. Only
 * Offsets where whitespace meets non-whitespace are tested, so each
 * whitespace run is walked back over at most once.
 */
function findBoundaries(text: string, citationRanges: readonly CitationRange[]): number[] {
  const out: number[] = [];
  for (let b = 1; b < text.length; b += 1) {
    if (!isWhitespace(text.charAt(b - 1)) || isWhitespace(text.charAt(b))) continue;
    if (isBoundaryAt(text, b, citationRanges)) out.push(b);
  }
  return out;
}

/** Per-origin code-unit counts and first-seen rank within one Sentence. */
type Tally = { counts: Map<Origin, number>; firstSeen: Origin[] };

function addToTally(tally: Tally, origin: Origin, units: number): void {
  const prev = tally.counts.get(origin);
  if (prev === undefined) tally.firstSeen.push(origin);
  tally.counts.set(origin, (prev ?? 0) + units);
}

/**
 * The Origin with the most code units; a tie goes to the Origin of the
 * earliest-starting tied span, which is the earliest in `firstSeen` because
 * spans are visited in start order.
 */
function dominantOf(tally: Tally): Origin | undefined {
  let best: Origin | undefined;
  let bestCount = -1;
  for (const origin of tally.firstSeen) {
    const count = tally.counts.get(origin) ?? 0;
    if (count > bestCount) {
      best = origin;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Tallies the spans overlapping [start, end), beginning at span index `from`,
 * and returns the tally with the index of the first span that may overlap the
 * next Sentence. A span straddling `end` is not passed, so the cursor only
 * moves forward and the whole segmentation visits O(spans + sentences) spans.
 */
function tallyRange(
  spans: readonly Span[],
  from: number,
  start: number,
  end: number,
): { tally: Tally; next: number } {
  const tally: Tally = { counts: new Map(), firstSeen: [] };
  let i = from;
  for (let span = spans[i]; span !== undefined && span.start < end; span = spans[i]) {
    const units = Math.min(span.end, end) - Math.max(span.start, start);
    if (units > 0) addToTally(tally, span.provenance.origin, units);
    if (span.end > end) break;
    i += 1;
  }
  return { tally, next: i };
}

/**
 * Segments `text` (Req 8.1, 8.2, 8.4, 8.7, 8.9). Returns `invalid_spans` if
 * the spans break the Coverage_Invariant; otherwise Sentences tiling the
 * text, each with its Dominant_Origin and its Origins in the fixed order
 * HUM, PST, AI, AI>HUM. Empty text gives zero Sentences.
 */
export function segmentWith(
  text: string,
  spans: readonly Span[],
  citationRanges: readonly CitationRange[],
): Result<readonly Sentence[], EngineError> {
  const checked = checkCoverage(text.length, spans);
  if (!checked.ok) return checked;
  if (text.length === 0) return ok([]);
  const cuts = [0, ...findBoundaries(text, citationRanges), text.length];
  const sentences: Sentence[] = [];
  let cursor = 0;
  for (let k = 0; k + 1 < cuts.length; k += 1) {
    const start = cuts[k] ?? 0;
    const end = cuts[k + 1] ?? text.length;
    const { tally, next } = tallyRange(spans, cursor, start, end);
    cursor = next;
    const dominantOrigin = dominantOf(tally);
    if (dominantOrigin === undefined)
      return err({ kind: "invalid_spans", offset: start, violation: "coverage" });
    const origins = ORIGIN_ORDER.filter((o) => tally.counts.has(o));
    sentences.push({ start, end, dominantOrigin, origins });
  }
  return ok(sentences);
}

/**
 * Segments `text` with the Extractor's own Citation ranges, so no Sentence
 * boundary falls strictly inside a Citation (Req 8.5). Returns
 * `invalid_spans` under the same rule as `segmentWith` (Req 8.9).
 */
export function segment(
  text: string,
  spans: readonly Span[],
): Result<readonly Sentence[], EngineError> {
  return segmentWith(text, spans, extract(text).citations);
}
