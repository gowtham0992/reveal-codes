/** 1-based line of `offset` in `text`: 1 plus the number of "\n" before it. */
export declare function lineAt(text: string, offset: number): number;
/** 1-based number of the first line, split on "\n", at which the two texts differ; null when equal. */
export declare function firstDifferingLine(a: string, b: string): number | null;
