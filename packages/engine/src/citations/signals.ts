/**
 * Signals and Gap_Signals (Glossary Signal, Gap_Signal; design A9,
 * "`citations/signals.ts`"; D18).
 *
 * `SIGNALS` is the capitalised, case-sensitive Signal list used by the
 * Party_Name rule and, through `party.ts`, by the Party_Stop_List.
 * `GAP_SIGNALS` adds the first-letter-lowercase forms of the ten Gap_Signals
 * and is used only by the preceding-quote gap matcher. `with` is in neither.
 */

/** The fourteen Signals, in Glossary order. Compared case-sensitively. */
export const SIGNALS: readonly string[] = [
  "See",
  "See also",
  "See, e.g.,",
  "E.g.,",
  "Accord",
  "Cf.",
  "But see",
  "Compare",
  "Citing",
  "Quoting",
  "But cf.",
  "Contra",
  "E.g.",
  "See generally",
];

/** The number of leading `SIGNALS` entries that are also Gap_Signals. */
const GAP_SIGNAL_COUNT = 10;

const lowerFirst = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

const CAPITALISED_GAP_SIGNALS: readonly string[] = SIGNALS.slice(0, GAP_SIGNAL_COUNT);

/** The ten Gap_Signals as listed, then each with its first letter lowercased. */
export const GAP_SIGNALS: readonly string[] = [
  ...CAPITALISED_GAP_SIGNALS,
  ...CAPITALISED_GAP_SIGNALS.map(lowerFirst),
];

/** Length of the longest Gap_Signal, `See, e.g.,`. */
export const MAX_GAP_SIGNAL = 10;

const isOffset = (n: number): boolean => Number.isInteger(n) && n >= 0;

/**
 * True when `text[start .. end)` begins with a Signal followed by a space, a
 * `,`, or the end of the range (Glossary Party_Name). Reads only inside the
 * range.
 */
export function startsWithSignal(text: string, start: number, end: number): boolean {
  if (!isOffset(start) || !isOffset(end)) return false;
  const bound = Math.min(end, text.length);
  for (const signal of SIGNALS) {
    const e = start + signal.length;
    if (e > bound || !text.startsWith(signal, start)) continue;
    if (e === bound || text[e] === " " || text[e] === ",") return true;
  }
  return false;
}

/**
 * The end Offset of every `GAP_SIGNALS` entry that starts at `at` and ends at
 * or before `limit`, ascending and without duplicates. At most three entries
 * can start at one Offset (`See`, `See also`, `See, e.g.,` or their
 * lowercase forms).
 */
export function gapSignalsAt(text: string, at: number, limit: number): readonly number[] {
  if (!isOffset(at) || !Number.isInteger(limit)) return [];
  const bound = Math.min(limit, text.length);
  const ends = new Set<number>();
  for (const signal of GAP_SIGNALS) {
    const e = at + signal.length;
    if (e <= bound && text.startsWith(signal, at)) ends.add(e);
  }
  return [...ends].sort((a, b) => a - b);
}
