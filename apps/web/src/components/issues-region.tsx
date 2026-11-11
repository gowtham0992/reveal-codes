"use client";

import { blockingIssues } from "@reveal-codes/engine";
import type { Document, Issue } from "@reveal-codes/engine";
import { useState } from "react";
import type { Store } from "../store-runtime";
import { IssuesList } from "./issues-list";
import type { VerifyAction } from "./issues-list";
import styles from "./issues-region.module.css";
import { OverrideDialog } from "./override-dialog";
import { VerifyResult } from "./verify-result";

export const DEMO_MODE_LINE =
  "Demo mode checks only the recorded demo citations. Any other citation shows as not found.";

export type IssuesRegionProps = Readonly<{
  document: Document;
  store: Store;
  now: () => Date;
  /** Select the Pos of an Offset and focus the Editor (Requirement 18.2). */
  onGo: (offset: number) => void;
  demoMode?: boolean;
  verifiedAt: string | null;
  /** The further line of the last completed Verify run. */
  note: string | null;
  /** The same start/disabled values the Toolbar uses. */
  verify: VerifyAction;
}>;

type Target = Readonly<{ issue: Issue; opener: HTMLElement }>;

/** "Issues" at zero; "Issues — <n> blocking" above zero (U+2014, one space each side). */
export function issuesHeading(blocking: number): string {
  return blocking > 0 ? `Issues \u2014 ${String(blocking)} blocking` : "Issues";
}

/** The Issues region: Fixtures_Mode line (15.7), the list and the Override_Dialog (Req 18). */
export function IssuesRegion(props: IssuesRegionProps) {
  const { document, store, now, onGo, demoMode = false, verifiedAt, note, verify } = props;
  const [target, setTarget] = useState<Target | null>(null);
  return (
    <aside aria-labelledby="issues-heading" className={styles["issues"]}>
      <h2 id="issues-heading" className={styles["heading"]}>
        {issuesHeading(blockingIssues(document).length)}
      </h2>
      <div className={styles["body"]}>
        <VerifyResult document={document} verifiedAt={verifiedAt} further={note} />
        {demoMode ? <p className={styles["note"]}>{DEMO_MODE_LINE}</p> : null}
        <IssuesList
          document={document}
          collapseUnchecked={verifiedAt === null}
          verify={verify}
          onGo={onGo}
          onOverride={(issue, opener) => {
            setTarget({ issue, opener });
          }}
        />
        {target === null ? null : (
          <OverrideDialog
            issueKey={target.issue.key}
            code={target.issue.code}
            store={store}
            now={now}
            restoreFocus={target.opener}
            onClose={() => {
              setTarget(null);
            }}
          />
        )}
      </div>
    </aside>
  );
}
