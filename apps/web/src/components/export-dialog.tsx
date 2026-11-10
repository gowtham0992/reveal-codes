"use client";

import { blockingIssues } from "@reveal-codes/engine";
import type { Document, Issue } from "@reveal-codes/engine";
import { canExport } from "@reveal-codes/export";
import { useEffect, useRef, useState } from "react";
import type { Store } from "../store-runtime";
import styles from "./export-dialog.module.css";
import { ExportIssues } from "./export-issues";
import { Modal, ModalActions } from "./modal";
import { OverrideDialog } from "./override-dialog";

export type ExportDialogProps = Readonly<{
  document: Document;
  store: Store;
  now: () => Date;
  notice: string | null;
  /** A download is in progress. */
  busy: boolean;
  restoreFocus?: HTMLElement | null | undefined;
  onGo: (offset: number) => void;
  onDownload: () => void;
  onPrint: () => void;
  onClose: () => void;
}>;

type Target = Readonly<{ issue: Issue; opener: HTMLElement }>;

export function downloadLabel(blocking: number): string {
  return blocking > 0 ? `Download .docx (${String(blocking)} blocking)` : "Download .docx";
}

export function printLabel(blocking: number): string {
  return blocking > 0 ? `Open print view (${String(blocking)} blocking)` : "Open print view";
}

/**
 * When the Override_Dialog closes and its opener row is gone (the override cleared
 * that issue), focus would fall to the page; move it back into this dialog.
 */
function useReclaimFocus(root: { current: HTMLElement | null }, target: Target | null): void {
  const wasOpen = useRef(false);
  useEffect(() => {
    const was = wasOpen.current;
    wasOpen.current = target !== null;
    if (!was || target !== null) return;
    const dialog = root.current?.closest<HTMLElement>('[role="dialog"]') ?? null;
    if (dialog === null || dialog.contains(document.activeElement)) return;
    const first = dialog.querySelector<HTMLElement>("button:not(:disabled)");
    (first ?? dialog).focus();
  }, [root, target]);
}

type BodyProps = Readonly<{
  document: Document;
  blocking: readonly Issue[];
  onGo: (offset: number) => void;
  onClose: () => void;
  onOverride: (target: Target) => void;
}>;

function ExportBody({ document, blocking, onGo, onClose, onOverride }: BodyProps) {
  if (blocking.length === 0) return null;
  return (
    <>
      <p className={styles["lead"]}>Resolve or override each item before you download or print.</p>
      <ExportIssues
        document={document}
        issues={blocking}
        onGo={(offset) => {
          onGo(offset);
          onClose();
        }}
        onOverride={(issue, opener) => {
          onOverride({ issue, opener });
        }}
      />
    </>
  );
}

type OverrideTargetProps = Readonly<{
  target: Target | null;
  store: Store;
  now: () => Date;
  onClose: () => void;
}>;

/** The Override_Dialog is a sibling of the Export modal so Tab trapping does not clash. */
function OverrideTarget({ target, store, now, onClose }: OverrideTargetProps) {
  if (target === null) return null;
  return (
    <OverrideDialog
      issueKey={target.issue.key}
      code={target.issue.code}
      store={store}
      now={now}
      restoreFocus={target.opener}
      onClose={onClose}
    />
  );
}

/** Export_Dialog (Requirement 2): the gate is recomputed on every render, so no timer is needed. */
export function ExportDialog(props: ExportDialogProps) {
  const { document, store, now, notice, busy, restoreFocus, onClose } = props;
  const [target, setTarget] = useState<Target | null>(null);
  const root = useRef<HTMLDivElement | null>(null);
  useReclaimFocus(root, target);
  const clearTarget = (): void => {
    setTarget(null);
  };
  const blocking = blockingIssues(document);
  const clear = canExport(document, null);
  return (
    <>
      <Modal title="Export" onClose={onClose} restoreFocus={restoreFocus}>
        <div ref={root} className={styles["body"]}>
          <ExportBody {...props} blocking={blocking} onOverride={setTarget} />
        </div>
        <p role="status" className={styles["status"]}>
          {notice}
        </p>
        <ModalActions>
          <button type="button" disabled={!clear || busy} onClick={props.onDownload}>
            {downloadLabel(blocking.length)}
          </button>
          <button type="button" disabled={!clear} onClick={props.onPrint}>
            {printLabel(blocking.length)}
          </button>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </ModalActions>
      </Modal>
      <OverrideTarget target={target} store={store} now={now} onClose={clearTarget} />
    </>
  );
}
