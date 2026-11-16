"use client";

import type { Document, Issue, IssueKey } from "@reveal-codes/engine";
import { ellipsize } from "@reveal-codes/export";
import type { DisplayInfo } from "@reveal-codes/verifier/link";
import { isFailingOpener } from "../pane/failing";
import { CourtListenerLink } from "./courtlistener-link";
import styles from "./export-dialog.module.css";
import { issueWords, wrongCaseFor } from "./issues-list";
import type { WrongCase } from "./issues-list";
import { MismatchLines } from "./mismatch-lines";

export const MAX_EXPORT_ISSUE_TEXT = 80;

export type ExportIssuesProps = Readonly<{
  document: Document;
  issues: readonly Issue[];
  /** Usable Display_Info of the session; without it the link is built from the clusterId. */
  info?: ReadonlyMap<IssueKey, DisplayInfo> | undefined;
  onGo: (offset: number) => void;
  onOverride: (issue: Issue, opener: HTMLElement) => void;
}>;

function WrongCaseBlock({ wrong }: Readonly<{ wrong: WrongCase | null }>) {
  if (wrong === null) return null;
  return (
    <>
      <MismatchLines lines={wrong.lines} className={styles["text"]} />
      <p className={styles["text"]}>
        <CourtListenerLink href={wrong.href} />
      </p>
    </>
  );
}

function RowActions({
  issue,
  onGo,
  onOverride,
}: Pick<ExportIssuesProps, "onGo" | "onOverride"> & { issue: Issue }) {
  return (
    <div className={styles["rowActions"]}>
      <button
        type="button"
        onClick={() => {
          onGo(issue.start);
        }}
      >
        Go
      </button>
      <button
        type="button"
        onClick={(e) => {
          onOverride(issue, e.currentTarget);
        }}
      >
        Override…
      </button>
    </div>
  );
}

/** One row per blocking issue, in document order: code chip (as in the Issues region), text, mismatch, Go and Override…. */
export function ExportIssues({ document, issues, info, onGo, onOverride }: ExportIssuesProps) {
  return (
    <ul className={styles["list"]} aria-label="Blocking items">
      {issues.map((issue) => (
        <li key={issue.key} className={styles["row"]}>
          <span
            className={isFailingOpener(issue.code) ? styles["codeChipFail"] : styles["codeChip"]}
          >
            {issue.code}
          </span>
          <p className={styles["text"]}>
            {ellipsize(document.text.slice(issue.start, issue.end), MAX_EXPORT_ISSUE_TEXT)}
          </p>
          <p className={styles["text"]}>{issueWords(issue.code, true)}</p>
          <WrongCaseBlock wrong={wrongCaseFor(document, issue, info)} />
          <RowActions issue={issue} onGo={onGo} onOverride={onOverride} />
        </li>
      ))}
    </ul>
  );
}
