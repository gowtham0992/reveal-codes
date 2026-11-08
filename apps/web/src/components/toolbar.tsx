import type { ReactNode } from "react";
import styles from "./toolbar.module.css";

export type ToolbarProps = Readonly<{
  notice: string | null;
  paneOpen: boolean;
  verifyDisabled: boolean;
  exportDisabled: boolean;
  /** Mode badge slot (Requirement 15); nothing is rendered when absent. */
  badge?: ReactNode;
  onNew?: () => void;
  onLoadDemo?: () => void;
  onVerify?: () => void;
  onTogglePane?: () => void;
  onExport?: () => void;
}>;

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
        Verify
      </button>
      <button type="button" aria-pressed={props.paneOpen} onClick={props.onTogglePane}>
        Reveal Codes (Alt-F3)
      </button>
      <button type="button" disabled={props.exportDisabled} onClick={props.onExport}>
        Export
      </button>
      {props.badge === undefined ? null : <span className={styles["badge"]}>{props.badge}</span>}
      <div role="status" aria-live="polite" className={styles["notice"]}>
        {props.notice}
      </div>
    </div>
  );
}
