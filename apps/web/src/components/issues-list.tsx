import { blockingIssues, issues } from "@reveal-codes/engine";
import type { Document, Issue, IssueCode } from "@reveal-codes/engine";
import { divergenceWords } from "../client/divergence";
import { isFailingOpener } from "../pane/failing";
import styles from "./issues-list.module.css";

export const MAX_ISSUE_TEXT = 80;
export const EMPTY_LINE = "No issues.";

const SEVERITY: Readonly<Record<IssueCode, string>> = {
  "CIT ✘": "not found",
  "CIT ≠": "wrong case",
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

/** Issue text shortened to at most 80 characters (Requirement 6, 8). */
export function issueText(document: Document, issue: Issue): string {
  return shorten(document.text.slice(issue.start, issue.end));
}

export type VerifyAction = Readonly<{ start: () => void; disabled: boolean }>;

export type IssuesListProps = Readonly<{
  document: Document;
  /** While true, unchecked items collapse into one row with a Verify button. */
  collapseUnchecked?: boolean;
  verify?: VerifyAction;
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
      <div className={styles["lineA"]}>
        <span className={isFailingOpener(issue.code) ? styles["chipFail"] : styles["chip"]}>
          {issue.code}
        </span>
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
      </div>
      <p className={`small-label ${styles["words"] ?? ""}`}>
        {`${blocking ? "blocking" : "overridden"}, ${SEVERITY[issue.code]}`}
      </p>
      <p className={styles["text"]}>{issueText(document, issue)}</p>
      {words === null ? null : <p className={styles["text"]}>{`Diverges at: ${words}`}</p>}
      {reason === undefined ? null : <p className={styles["text"]}>{`Overridden: ${reason}`}</p>}
    </li>
  );
}

export function uncheckedText(n: number): string {
  return n === 1
    ? "1 citation or quotation has not been checked."
    : `${String(n)} citations and quotations have not been checked.`;
}

function UncheckedRow({ count, verify }: Readonly<{ count: number; verify: VerifyAction }>) {
  return (
    <li className={styles["row"]}>
      <div className={`${styles["lineA"] ?? ""} ${styles["lineEnd"] ?? ""}`}>
        <div className={styles["actions"]}>
          <button type="button" onClick={verify.start} disabled={verify.disabled}>
            Verify
          </button>
        </div>
      </div>
      <p className={styles["text"]}>{uncheckedText(count)}</p>
    </li>
  );
}

const NO_VERIFY: VerifyAction = { start: () => undefined, disabled: true };

/** One row per `issues(document)` in Engine order (Requirements 18.1 to 18.4, 18.10); Req 6 collapse. */
export function IssuesList(props: IssuesListProps) {
  const { document, onGo, onOverride, collapseUnchecked = false, verify = NO_VERIFY } = props;
  const all = issues(document);
  if (all.length === 0) return <p className={styles["empty"]}>{EMPTY_LINE}</p>;
  const blocking = new Set(blockingIssues(document).map((i) => i.key));
  const isUnchecked = (i: Issue): boolean => i.code === "CIT …" || i.code === "QUO …";
  const unchecked = collapseUnchecked ? all.filter(isUnchecked).length : 0;
  const shown = unchecked > 0 ? all.filter((i) => !isUnchecked(i)) : all;
  return (
    <ul className={styles["list"]}>
      {unchecked > 0 ? <UncheckedRow count={unchecked} verify={verify} /> : null}
      {shown.map((issue) => (
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
