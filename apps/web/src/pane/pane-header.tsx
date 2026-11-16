import type { MouseEvent } from "react";
import type { CodeFamily } from "./layout";
import { cls, codeClass } from "./code-class";

type LegendEntry = Readonly<{
  code: string;
  words: string;
  family: CodeFamily;
  failing: boolean;
}>;

/** The eight Legend entries, in the order of Requirement 2.4. */
export const LEGEND: readonly LegendEntry[] = [
  { code: "[HUM]", words: "typed", family: "HUM", failing: false },
  { code: "[PST]", words: "pasted, origin not recorded", family: "PST", failing: false },
  { code: "[AI]", words: "assistant", family: "AI", failing: false },
  { code: "[AI>HUM]", words: "assistant, edited", family: "AI>HUM", failing: false },
  { code: "[CIT ✓]", words: "found", family: "verified", failing: false },
  { code: "[CIT ✘]", words: "not found", family: "failed", failing: true },
  { code: "[CIT ≠]", words: "wrong case", family: "failed", failing: true },
  { code: "[QUO ✘]", words: "not in the opinion", family: "failed", failing: true },
];

function keepEditorFocus(event: MouseEvent<HTMLDivElement>): void {
  event.preventDefault();
}

/** The strip above the Pane_Body: the pane name at the left, the Legend at the right. */
export function PaneHeader() {
  return (
    <div className={cls("header")} onMouseDown={keepEditorFocus}>
      <span className={cls("title")}>Reveal Codes</span>
      <span className={cls("legend")}>
        {LEGEND.map((entry) => (
          <span key={entry.code} className={cls("legendItem")}>
            <span className={codeClass(entry.family, entry.failing)}>
              {entry.failing ? (
                <span className={cls("legendBlock")}>{entry.code}</span>
              ) : (
                entry.code
              )}
            </span>
            {` ${entry.words}`}
          </span>
        ))}
      </span>
    </div>
  );
}
