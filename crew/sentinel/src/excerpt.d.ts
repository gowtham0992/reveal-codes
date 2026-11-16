/** Code units kept before the first difference (D18). */
export declare const LEAD = 30;
/**
 * Two windows over one span of two lines (D18): whole when both fit in `max`,
 * otherwise both cut from the same start, LEAD units before the first difference.
 */
export declare function excerptPair(before: string, after: string, max: number): readonly [string, string];
