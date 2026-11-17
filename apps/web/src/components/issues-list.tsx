import { blockingIssues, issues } from "@reveal-codes/engine";
import type { Document, Issue, IssueCode, IssueKey } from "@reveal-codes/engine";
import type { DisplayInfo } from "@reveal-codes/verifier/link";
import {
  MAX_ISSUE_TEXT,
  STATUS_WORDS,
  divergenceFor,
  shorten,
  wrongCaseFor,
} from "../client/check-rows";
import type { WrongCase } from "../client/check-rows";
import { isFailingOpener } from "../pane/failing";
import { CourtListenerLink } from "./courtlistener-link";
import { MismatchLines } from "./mismatch-lines";
import styles from "./issues-list.module.css";

export { MAX_ISSUE_TEXT, shorten, wrongCaseFor };
export type { WrongCase };
export const EMPTY_LINE = "No issues.";

/** The words under a row's chip: `blocking, wrong case` or `overridden, wrong case`. */
export function issueWords(code: IssueCode, blocking: boolean): string {
  return `${blocking ? "blocking" : "overridden"}, ${STATUS_WORDS[code]}`;
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
  /** Display_Info of the latest Verify_Run, usable only for the current Document (memory only). */
  info?: ReadonlyMap<IssueKey, DisplayInfo> | undefined;
  onGo: (offset: number) => void;
  onOverride: (issue: Issue, opener: HTMLElement) => void;
}>;

type RowProps = Readonly<{
  document: Document;
  issue: Issue;
  blocking: boolean;
  reason: string | undefined;
  info: IssuesListProps["info"];
  onGo: IssuesListProps["onGo"];
  onOverride: IssuesListProps["onOverride"];
}>;

function WrongCaseLines({ wrong }: Readonly<{ wrong: WrongCase | null }>) {
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

function IssueRow({ document, issue, blocking, reason, info, onGo, onOverride }: RowProps) {
  const words = divergenceFor(document, issue);
  const wrong = wrongCaseFor(document, issue, info);
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
      <p className={`small-label ${styles["words"] ?? ""}`}>{issueWords(issue.code, blocking)}</p>
      <p className={styles["text"]}>{issueText(document, issue)}</p>
      <WrongCaseLines wrong={wrong} />
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
  const { info } = props;
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
          info={info}
          onGo={onGo}
          onOverride={onOverride}
        />
      ))}
    </ul>
  );
}
