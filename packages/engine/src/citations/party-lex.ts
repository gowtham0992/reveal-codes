/**
 * Right-to-left token reader for `partyStartFor` (design A9, "Tokens"; D17).
 *
 * `W` is the set of code units allowed inside a word token: Unicode letters,
 * ASCII digits, `.`, `'`, `’`, and `-`. A token is a maximal `W` run, or a
 * lone `&` with a space on each side. Every read stays inside the window
 * `[lo, end)`; a token whose start or predecessor would lie before `lo`
 * (other than a token that starts at Offset 0) is reported as `null`, which
 * the automaton treats as a stop.
 */

/** A token `[start, end)` of the Text. */
export type PartyToken = Readonly<{ start: number; end: number }>;

const LETTER = /^\p{L}$/u;
const W_PUNCT = new Set([".", "'", "’", "-"]);

const isHigh = (u: number): boolean => u >= 0xd800 && u <= 0xdbff;
const isLow = (u: number): boolean => u >= 0xdc00 && u <= 0xdfff;

/** True when the single code unit `ch` is in `W` (no surrogates). */
function isWUnit(ch: string): boolean {
  if (ch.length !== 1) return false;
  const u = ch.charCodeAt(0);
  if (u >= 48 && u <= 57) return true;
  return W_PUNCT.has(ch) || LETTER.test(ch);
}

/**
 * How many code units of `W` end at `k + 1` (1 for a BMP unit, 2 for a
 * Surrogate_Pair letter), 0 if `text[k]` is not in `W`, or -1 if deciding
 * would need a read before `lo`.
 */
function wWidthEndingAt(text: string, k: number, lo: number): number {
  const u = text.charCodeAt(k);
  if (!isLow(u)) return isWUnit(text.charAt(k)) ? 1 : 0;
  if (k - 1 < lo) return k > 0 ? -1 : 0;
  if (!isHigh(text.charCodeAt(k - 1))) return 0;
  return LETTER.test(text.slice(k - 1, k + 1)) ? 2 : 0;
}

/** True when `text[i]` is in `W`. Reads `text[i − 1 .. i + 2)` at most. */
export function isPartyWordUnitAt(text: string, i: number): boolean {
  if (i < 0 || i >= text.length) return false;
  const u = text.charCodeAt(i);
  if (isHigh(u)) return isLow(text.charCodeAt(i + 1)) && LETTER.test(text.slice(i, i + 2));
  return wWidthEndingAt(text, i, 0) > 0;
}

/**
 * The maximal `W` run ending at `end`, or `null` if it is empty or its start
 * or predecessor lies before `lo` (D17).
 */
export function readWordTokenBefore(text: string, end: number, lo: number): PartyToken | null {
  let j = end;
  while (j > lo) {
    const width = wWidthEndingAt(text, j - 1, lo);
    if (width < 0) return null;
    if (width === 0) break;
    j -= width;
  }
  if (j === end) return null;
  if (j === lo && lo > 0) return null;
  return { start: j, end };
}

/**
 * The token ending at `end`, where `text[end]` is the single space that
 * separates it from the token on its right: a lone `&` with a space on its
 * left, or a maximal `W` run.
 */
export function readTokenBefore(text: string, end: number, lo: number): PartyToken | null {
  if (end - 1 >= lo && text[end - 1] === "&") {
    return end - 2 >= lo && text[end - 2] === " " ? { start: end - 1, end } : null;
  }
  return readWordTokenBefore(text, end, lo);
}
