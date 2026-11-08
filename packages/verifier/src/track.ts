// Origin tracking for prefixLength (design A9 step 1).

import {
  ELLIPSIS,
  WS_RUN,
  foldCase,
  matchedBrackets,
  straightenDashes,
  straightenQuotes,
} from "./normalise";

export type Tracked = {
  /** The folded normal form before tail trimming (steps 1 to 7, then case folding). */
  readonly v: string;
  /** For each unit of `v`, the original quote index that produced it (non-decreasing). */
  readonly origin: readonly number[];
};

type Run = { readonly text: string; readonly origin: readonly number[] };

function dropBrackets(run: Run): Run {
  const drop = new Set<number>();
  for (const [o, c] of matchedBrackets(run.text)) {
    drop.add(o);
    drop.add(c);
  }
  if (drop.size === 0) return run;
  let text = "";
  const origin: number[] = [];
  for (let i = 0; i < run.text.length; i += 1) {
    if (drop.has(i)) continue;
    text += run.text.charAt(i);
    origin.push(run.origin[i] as number);
  }
  return { text, origin };
}

/** Replace every match of `re` by the single unit `to`, keeping the origin of the match start. */
function substitute(run: Run, re: RegExp, to: string): Run {
  let text = "";
  const origin: number[] = [];
  let last = 0;
  const copy = (end: number): void => {
    for (let i = last; i < end; i += 1) {
      text += run.text.charAt(i);
      origin.push(run.origin[i] as number);
    }
  };
  for (const m of run.text.matchAll(re)) {
    copy(m.index);
    text += to;
    origin.push(run.origin[m.index] as number);
    last = m.index + m[0].length;
  }
  copy(run.text.length);
  return { text, origin };
}

function trimOneSpace(run: Run): Run {
  let from = 0;
  let to = run.text.length;
  if (run.text[from] === " ") from += 1;
  if (to > from && run.text[to - 1] === " ") to -= 1;
  return { text: run.text.slice(from, to), origin: run.origin.slice(from, to) };
}

/**
 * Run the pipeline over `quote` while recording origins.
 * Returns null (tracking abandoned) when NFC changes the quote or the result.
 */
export function trackQuote(quote: string): Tracked | null {
  if (quote.normalize("NFC") !== quote) return null;
  const start: Run = {
    text: straightenDashes(straightenQuotes(quote)),
    origin: Array.from({ length: quote.length }, (_, i) => i),
  };
  const noBrackets = dropBrackets(start);
  const ellipsed = substitute(noBrackets, ELLIPSIS, "…");
  const collapsed = trimOneSpace(substitute(ellipsed, WS_RUN, " "));
  if (collapsed.text.normalize("NFC") !== collapsed.text) return null;
  return { v: foldCase(collapsed.text), origin: collapsed.origin };
}

/** `kOf[n]` = number of units of `v` whose origin is below `n`, for n in 0..length. */
export function unitCounts(origin: readonly number[], length: number): number[] {
  const counts: number[] = new Array<number>(length + 1).fill(0);
  let k = 0;
  for (let n = 0; n <= length; n += 1) {
    while (k < origin.length && (origin[k] as number) < n) k += 1;
    counts[n] = k;
  }
  return counts;
}

/**
 * `ends[k]` = length of `v.slice(0, k)` after trailing trimming: spaces only,
 * or spaces and `. , ; :` when `tail` is true.
 */
export function trimmedEnds(v: string, tail: boolean): number[] {
  const ends: number[] = new Array<number>(v.length + 1).fill(0);
  for (let k = 1; k <= v.length; k += 1) {
    const ch = v.charAt(k - 1);
    const trimmable = ch === " " || (tail && ".,;:".includes(ch));
    ends[k] = trimmable ? (ends[k - 1] as number) : k;
  }
  return ends;
}
