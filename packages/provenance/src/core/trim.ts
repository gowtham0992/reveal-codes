/**
 * Character trim (design M2 and M15, Req 4.15 and 4.16). Cuts the common prefix
 * and then the common suffix of two texts (the whole texts, then each Hunk), by
 * UTF-16 code unit, never between a surrogate pair or a CR LF pair. Pure; no `node:`.
 */
import type { Hunk } from "./types.js";

function isHigh(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}
function isLow(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}
const CR = 0x0d;
const LF = 0x0a;

function commonPrefix(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let n = 0;
  while (n < max && a.charCodeAt(n) === b.charCodeAt(n)) n++;
  return n;
}

function commonSuffix(a: string, b: string, max: number): number {
  let n = 0;
  while (n < max && a.charCodeAt(a.length - 1 - n) === b.charCodeAt(b.length - 1 - n)) n++;
  return n;
}

/** The prefix length, shortened so that it ends between no pair in either text. */
function safePrefix(oldText: string, newText: string): number {
  const p = commonPrefix(oldText, newText);
  if (p === 0) return 0;
  const last = oldText.charCodeAt(p - 1);
  if (isHigh(last)) return p - 1;
  const splitsCrLf = last === CR && (oldText.charCodeAt(p) === LF || newText.charCodeAt(p) === LF);
  return splitsCrLf ? p - 1 : p;
}

/** The suffix length (at most `max`), shortened so that it starts between no pair in either text. */
function safeSuffix(oldText: string, newText: string, max: number): number {
  const s = commonSuffix(oldText, newText, max);
  if (s === 0) return 0;
  const oi = oldText.length - s;
  const ni = newText.length - s;
  const first = oldText.charCodeAt(oi);
  const splitsPair = isLow(first)
    ? isHigh(oldText.charCodeAt(oi - 1)) || isHigh(newText.charCodeAt(ni - 1))
    : first === LF && (oldText.charCodeAt(oi - 1) === CR || newText.charCodeAt(ni - 1) === CR);
  return splitsPair ? s - 1 : s;
}

/** The lengths of the common prefix and then the common suffix (not overlapping), pair-safe in both texts. */
export function commonAffixes(
  oldText: string,
  newText: string,
): { prefix: number; suffix: number } {
  const prefix = safePrefix(oldText, newText);
  const room = Math.min(oldText.length, newText.length) - prefix;
  return { prefix, suffix: safeSuffix(oldText, newText, room) };
}

/**
 * The part of `hunk` that really changed, or `null` when its old and new text
 * are equal. `oldDocText` is the whole old text that the Hunk's offsets index.
 */
export function trimHunk(oldDocText: string, hunk: Hunk): Hunk | null {
  const oldText = oldDocText.slice(hunk.from, hunk.to);
  const newText = hunk.text;
  const { prefix, suffix } = commonAffixes(oldText, newText);
  const from = hunk.from + prefix;
  const to = hunk.to - suffix;
  const text = newText.slice(prefix, newText.length - suffix);
  if (from === to && text === "") return null;
  return { from, to, text };
}
