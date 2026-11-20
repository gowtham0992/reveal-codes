/**
 * The Source_Legend and the fixed sentences of the Reveal_Command (Req 9.3, 9.9, 10.9, 10.12).
 * Pure; no `node:`. The words are those of requirements.md, Requirement 9, criterion 3.
 */
/** One item of the Source_Legend: the code as printed and its meaning. */
export type LegendItem = { code: string; words: string };
/** The four items, in the order of Requirement 9, criterion 3. */
export const LEGEND_ITEMS: readonly LegendItem[] = [
  { code: "[AI:<run>]", words: "changed while the agent was working, with the run it belongs to" },
  {
    code: "[AI>HUM:<run>]",
    words: "agent text in a run that the Engine counts as edited while no agent window was open",
  },
  {
    code: "[HUM]",
    words:
      "changed while no agent window was open; typing, pasting and other tools are not told apart",
  },
  { code: "[PST]", words: "already in the file when recording started; origin not recorded" },
];
/** The legend as four one-line strings, `<code> <words>`. */
export function legendLines(): string[] {
  return LEGEND_ITEMS.map((item) => `${item.code} ${item.words}`);
}
/** The notice of Requirement 9, criterion 9 and 12.5: the `[HUM]` item, as printed in the legend. */
export function humNotice(): string {
  return legendLines()[2] ?? "";
}
/** The first line of the output for a stale file (design, The Reveal_Command). */
export function staleLine(path: string, unrecorded: number): string {
  return `stale: ${path} changed after the last recorded event; ${String(unrecorded)} characters not yet recorded; run: reveal --record`;
}
/** The line of Requirement 10, criterion 12, with `<n>` replaced by the count. */
export function noPromptSessionsLine(count: number): string {
  return `Sessions with no prompt events: ${String(count)} counted. In such a session an edit the agent made between tasks is recorded as [HUM]. The count can miss sessions or count one twice; see Limits.`;
}
