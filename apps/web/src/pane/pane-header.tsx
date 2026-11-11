import { Fragment } from "react";
import type { MouseEvent } from "react";
import type { CodeFamily } from "./layout";
import { cls, codeClass } from "./code-class";

type LegendEntry = Readonly<{
  code: string;
  words: string;
  family: CodeFamily;
  failing: boolean;
}>;

/** The seven Legend entries, in the order of Requirement 2.4. */
export const LEGEND: readonly LegendEntry[] = [
  { code: "[HUM]", words: "typed", family: "HUM", failing: false },
  { code: "[PST]", words: "pasted", family: "PST", failing: false },
  { code: "[AI]", words: "assistant", family: "AI", failing: false },
  { code: "[AI>HUM]", words: "assistant, edited", family: "AI>HUM", failing: false },
  { code: "[CIT ✓]", words: "found", family: "verified", failing: false },
  { code: "[CIT ✘]", words: "not found", family: "failed", failing: true },
  { code: "[QUO ✘]", words: "not in the opinion", family: "failed", failing: true },
];

function keepEditorFocus(event: MouseEvent<HTMLDivElement>): void {
  event.preventDefault();
}

/** The strip above the Pane_Body: the pane name at the left, the Legend at the right. */
export function PaneHeader() {
  return (
    <div className={cls("header")} onMouseDown={keepEditorFocus}>
      <span>Reveal Codes</span>
      <span className={cls("legend")}>
        {LEGEND.map((entry, i) => (
          <Fragment key={entry.code}>
            {i === 0 ? null : " · "}
            <span className={codeClass(entry.family, entry.failing)}>{entry.code}</span>
            {` ${entry.words}`}
          </Fragment>
        ))}
      </span>
    </div>
  );
}
