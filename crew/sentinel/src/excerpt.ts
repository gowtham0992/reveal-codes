import { ellipsize } from "@reveal-codes/export";

/** Code units kept before the first difference (D18). */
export const LEAD = 30;

const isHigh = (c: number): boolean => c >= 0xd800 && c <= 0xdbff;
const isLow = (c: number): boolean => c >= 0xdc00 && c <= 0xdfff;

function commonPrefix(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i += 1;
  return i;
}

/**
 * Two windows over one span of two lines (D18): whole when both fit in `max`,
 * otherwise both cut from the same start, LEAD units before the first difference.
 */
export function excerptPair(before: string, after: string, max: number): readonly [string, string] {
  if (before.length <= max && after.length <= max) return [before, after];
  let start = Math.max(0, commonPrefix(before, after) - LEAD);
  if (start > 0 && isLow(before.charCodeAt(start)) && isHigh(before.charCodeAt(start - 1))) {
    start -= 1;
  }
  const mark = start > 0 ? "…" : "";
  return [
    `${mark}${ellipsize(before.slice(start), max)}`,
    `${mark}${ellipsize(after.slice(start), max)}`,
  ];
}
