import { COURT_RULES_PATH, COURT_RULES_SHORT } from "../courts/links";
import { Mark } from "./mark";
import styles from "./toolbar.module.css";
import type { NextStep } from "./next-step";

export type ToolbarProps = Readonly<{
  /** The button this step names carries data-primary; "none" marks no button. */
  step: NextStep;
  notice: string | null;
  /** The Empty_Draft condition; the Sample_Buttons render only while true. */
  empty: boolean;
  paneOpen: boolean;
  verifyDisabled: boolean;
  /** While true the Verify button reads "Verifying…". */
  verifyRunning?: boolean;
  /** Blocking issue count; the Export label reads "Export (<n> blocking)" when above zero. */
  blockingCount?: number;
  /** True when the Document has no character other than whitespace. */
  exportDisabled?: boolean;
  onNew?: () => void;
  onOpen?: () => void;
  /** The handler behind the Empty_Page "Load the Avianca citations" link. */
  onLoadAvianca?: () => void;
  onLoadDemo?: () => void;
  onVerify?: () => void;
  onTogglePane?: () => void;
  onExport?: () => void;
}>;

function Wordmark() {
  return (
    <span className={styles["wordmark"]}>
      <Mark />
      Reveal Codes
    </span>
  );
}

export function exportLabel(blocking: number): string {
  return blocking > 0 ? `Export (${String(blocking)} blocking)` : "Export";
}

function primary(step: NextStep, own: NextStep): "true" | undefined {
  return step === own ? "true" : undefined;
}

function ExportButton(props: ToolbarProps) {
  return (
    <button
      type="button"
      data-primary={primary(props.step, "export")}
      disabled={props.exportDisabled === true}
      onClick={props.onExport}
    >
      {exportLabel(props.blockingCount ?? 0)}
    </button>
  );
}
function SampleButtons(props: ToolbarProps) {
  return (
    <>
      <button
        type="button"
        data-primary={primary(props.step, "load-avianca")}
        onClick={props.onLoadAvianca}
      >
        Load Mata v. Avianca
      </button>
      <button type="button" onClick={props.onLoadDemo}>
        Load demo motion
      </button>
    </>
  );
}
function FileGroup(props: ToolbarProps) {
  return (
    <div role="group" className={styles["group"]}>
      <button type="button" onClick={props.onNew}>
        New
      </button>
      <button type="button" onClick={props.onOpen}>
        Open
      </button>
      {props.empty ? <SampleButtons {...props} /> : null}
    </div>
  );
}

export function Toolbar(props: ToolbarProps) {
  return (
    <div role="toolbar" aria-label="Document actions" className={styles["toolbar"]}>
      <Wordmark />
      <FileGroup {...props} />
      <div role="group" className={styles["group"]}>
        <button
          type="button"
          data-primary={primary(props.step, "verify")}
          disabled={props.verifyDisabled}
          onClick={props.onVerify}
        >
          {props.verifyRunning === true ? "Verifying…" : "Verify"}
        </button>
      </div>
      <div role="group" className={styles["group"]}>
        <button type="button" aria-pressed={props.paneOpen} onClick={props.onTogglePane}>
          {props.paneOpen ? "Hide codes (Alt-F3)" : "Show codes (Alt-F3)"}
        </button>
        <ExportButton {...props} />
      </div>
      <div
        role="status"
        aria-live="polite"
        className={styles["notice"]}
        title={props.notice ?? undefined}
      >
        {props.notice}
      </div>
      <a href={COURT_RULES_PATH} target="_blank" rel="noreferrer" className={styles["link"]}>
        {COURT_RULES_SHORT}
      </a>
    </div>
  );
}
