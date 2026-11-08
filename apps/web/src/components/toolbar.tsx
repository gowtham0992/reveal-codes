import type { ReactNode } from "react";
import styles from "./toolbar.module.css";

export type ToolbarProps = Readonly<{
  notice: string | null;
  paneOpen: boolean;
  verifyDisabled: boolean;
  /** While true the Verify button reads "Verifying…". */
  verifyRunning?: boolean;
  /** Blocking issue count; the Export label reads "Export (<n> blocking)" when above zero. */
  blockingCount?: number;
  /** Mode badge slot (Requirement 15); nothing is rendered when absent. */
  badge?: ReactNode;
  onNew?: () => void;
  onLoadDemo?: () => void;
  onVerify?: () => void;
  onTogglePane?: () => void;
  onExport?: () => void;
}>;

export function exportLabel(blocking: number): string {
  return blocking > 0 ? `Export (${String(blocking)} blocking)` : "Export";
}

export function Toolbar(props: ToolbarProps) {
  return (
    <div role="toolbar" aria-label="Document actions" className={styles["toolbar"]}>
      <button type="button" onClick={props.onNew}>
        New
      </button>
      <button type="button" onClick={props.onLoadDemo}>
        Load demo motion
      </button>
      <button type="button" disabled={props.verifyDisabled} onClick={props.onVerify}>
        {props.verifyRunning === true ? "Verifying…" : "Verify"}
      </button>
      <button type="button" aria-pressed={props.paneOpen} onClick={props.onTogglePane}>
        Reveal Codes (Alt-F3)
      </button>
      <button type="button" onClick={props.onExport}>
        {exportLabel(props.blockingCount ?? 0)}
      </button>
      {props.badge === undefined ? null : <span className={styles["badge"]}>{props.badge}</span>}
      <div role="status" aria-live="polite" className={styles["notice"]}>
        {props.notice}
      </div>
    </div>
  );
}
