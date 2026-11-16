import type { Document } from "@reveal-codes/engine";

const CAPTION_MAX = 120;

function isHigh(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLow(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/** First `max` UTF-16 code units; one fewer when the cut would split a surrogate pair. */
export function clip(text: string, max: number): string {
  if (max <= 0) return "";
  if (text.length <= max) return text;
  const split = isHigh(text.charCodeAt(max - 1)) && isLow(text.charCodeAt(max));
  return text.slice(0, split ? max - 1 : max);
}

/** `text` when it fits in `max`, else its first `max - 1` units followed by "…". */
export function ellipsize(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${clip(text, max - 1)}…`;
}

/** a / t * 100 rounded half up to one decimal, in integer arithmetic; "0.0" when t is 0. */
export function percent(a: number, t: number): string {
  if (t === 0) return "0.0";
  const tenths = Math.floor((2000 * a + t) / (2 * t));
  return `${String(Math.floor(tenths / 10))}.${String(tenths % 10)}`;
}

/** First non-empty line of the document, trimmed and clipped; "" when all blank. */
export function captionOf(document: Document): string {
  const line = document.text.split("\n").find((l) => l.trim() !== "");
  return line === undefined ? "" : clip(line.trim(), CAPTION_MAX);
}
