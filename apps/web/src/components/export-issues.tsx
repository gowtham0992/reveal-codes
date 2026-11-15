"use client";

import type { Document, Issue } from "@reveal-codes/engine";
import { ellipsize } from "@reveal-codes/export";
import { isFailingOpener } from "../pane/failing";
import styles from "./export-dialog.module.css";
import { issueWords } from "./issues-list";

export const MAX_EXPORT_ISSUE_TEXT = 80;

export type ExportIssuesProps = Readonly<{
  document: Document;
  issues: readonly Issue[];
  onGo: (offset: number) => void;
  onOverride: (issue: Issue, opener: HTMLElement) => void;
}>;

/** One row per blocking issue, in document order: code chip (as in the Issues region), text, Go and Override…. */
export function ExportIssues({ document, issues, onGo, onOverride }: ExportIssuesProps) {
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
        </li>
      ))}
    </ul>
  );
}
