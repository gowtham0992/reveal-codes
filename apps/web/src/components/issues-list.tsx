import { blockingIssues, issues } from "@reveal-codes/engine";
import type { Document, Issue, IssueCode } from "@reveal-codes/engine";
import { divergenceWords } from "../client/divergence";
import styles from "./issues-list.module.css";

export const MAX_ISSUE_TEXT = 80;
export const EMPTY_LINE = "No issues.";

const SEVERITY: Readonly<Record<IssueCode, string>> = {
  "CIT ✘": "not found",
  "CIT ?": "ambiguous",
  "CIT …": "unchecked",
  "QUO ✘": "quote not found in opinion",
  "QUO …": "quote unchecked",
};

/** Text shortened to at most 80 characters (code points), the last being an ellipsis. */
export function shorten(text: string): string {
  const points = Array.from(text);
  if (points.length <= MAX_ISSUE_TEXT) return text;
  return `${points.slice(0, MAX_ISSUE_TEXT - 1).join("")}…`;
}

/** Divergence_Words for a `QUO ✘` row, computed here from the current Document (Req 18.11). */
function divergenceFor(document: Document, issue: Issue): string | null {
  if (issue.code !== "QUO ✘") return null;
  const rec = document.quotes.find((q) => q.key === issue.key);
  if (rec === undefined || rec.result.status !== "mismatch") return null;
  return divergenceWords(document.text.slice(issue.start, issue.end), rec.result.prefixLength);
}

export type IssuesListProps = Readonly<{
  document: Document;
  onGo: (offset: number) => void;
  onOverride: (issue: Issue, opener: HTMLElement) => void;
}>;

type RowProps = Readonly<{
  document: Document;
  issue: Issue;
  blocking: boolean;
  reason: string | undefined;
  onGo: IssuesListProps["onGo"];
  onOverride: IssuesListProps["onOverride"];
}>;

function IssueRow({ document, issue, blocking, reason, onGo, onOverride }: RowProps) {
  const words = divergenceFor(document, issue);
  return (
    <li className={styles["row"]}>
      <div className={styles["head"]}>
        <span className={styles["code"]}>{issue.code}</span>
        <span>{`${blocking ? "blocking" : "overridden"}, ${SEVERITY[issue.code]}`}</span>
      </div>
      <p className={styles["text"]}>{shorten(document.text.slice(issue.start, issue.end))}</p>
      {words === null ? null : <p className={styles["text"]}>{`Diverges at: ${words}`}</p>}
      {reason === undefined ? null : <p className={styles["text"]}>{`Overridden: ${reason}`}</p>}
      <div className={styles["actions"]}>
        <button
          type="button"
          onClick={() => {
            onGo(issue.start);
          }}
        >
          Go
        </button>
        {blocking ? (
          <button
            type="button"
            onClick={(e) => {
              onOverride(issue, e.currentTarget);
            }}
          >
            Override…
          </button>
        ) : null}
      </div>
    </li>
  );
}

/** One row per `issues(document)` in Engine order (Requirements 18.1 to 18.4, 18.10). */
export function IssuesList({ document, onGo, onOverride }: IssuesListProps) {
  const all = issues(document);
  if (all.length === 0) return <p className={styles["empty"]}>{EMPTY_LINE}</p>;
  const blocking = new Set(blockingIssues(document).map((i) => i.key));
  return (
    <ul className={styles["list"]}>
      {all.map((issue) => (
        <IssueRow
          key={issue.key}
          document={document}
          issue={issue}
          blocking={blocking.has(issue.key)}
          reason={document.overrides.find((o) => o.key === issue.key)?.reason}
          onGo={onGo}
          onOverride={onOverride}
        />
      ))}
    </ul>
  );
}
