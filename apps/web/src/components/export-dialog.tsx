"use client";

import { blockingIssues } from "@reveal-codes/engine";
import type { Document, Issue } from "@reveal-codes/engine";
import type { OrderContext } from "@reveal-codes/export";
import { useEffect, useRef, useState } from "react";
import type { OrderSelectionStore } from "../order-selection";
import type { Store } from "../store-runtime";
import { ConfidentialityCheckbox } from "./confidentiality-checkbox";
import styles from "./export-dialog.module.css";
import { ExportIssues } from "./export-issues";
import { issueText } from "./issues-list";
import { Modal, ModalActions } from "./modal";
import { OrderPicker, OrderSummary } from "./order-picker";
import { OverrideDialog } from "./override-dialog";
import { useOrderGate } from "./use-order-gate";
import type { OrderGate } from "./use-order-gate";

export type ExportDialogProps = Readonly<{
  document: Document;
  store: Store;
  orderStore: OrderSelectionStore;
  now: () => Date;
  notice: string | null;
  /** Clears the export result notice. */
  clearNotice: () => void;
  /** A download is in progress. */
  busy: boolean;
  restoreFocus?: HTMLElement | null | undefined;
  onGo: (offset: number) => void;
  onDownload: (context: OrderContext | null) => void;
  onPrint: () => void;
  onClose: () => void;
}>;

type Target = Readonly<{ issue: Issue; opener: HTMLElement }>;

export const DOWNLOAD_LABEL = "Download .docx";
export const PRINT_LABEL = "Open print view";
export const NOTHING_TO_EXPORT = "There is nothing to export yet.";
/** True when the Document holds at least one character that is not whitespace. */
export function hasExportableText(document: Document): boolean {
  return /\S/u.test(document.text);
}

/** The line above the action buttons; null when nothing blocks. */
export function blockingLine(n: number): string | null {
  if (n === 0) return null;
  return n === 1 ? "1 blocking item remains" : `${String(n)} blocking items remain`;
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
  document: Document;
  target: Target | null;
  store: Store;
  now: () => Date;
  onClose: () => void;
}>;

/** The Override_Dialog is a sibling of the Export modal so Tab trapping does not clash. */
function OverrideTarget({ document, target, store, now, onClose }: OverrideTargetProps) {
  if (target === null) return null;
  return (
    <OverrideDialog
      issueKey={target.issue.key}
      code={target.issue.code}
      issueText={issueText(document, target.issue)}
      store={store}
      now={now}
      restoreFocus={target.opener}
      onClose={onClose}
    />
  );
}

type OrderProps = Readonly<{ gate: OrderGate }>;

/** Picker, summary, confidentiality checkbox and prohibition notice (no override control). */
function ExportOrder({ gate }: OrderProps) {
  return (
    <div className={styles["order"]}>
      <OrderPicker selection={gate.selection} onSelect={gate.select} />
      <OrderSummary entry={gate.entry} />
      {gate.needsTick ? (
        <ConfidentialityCheckbox checked={gate.ticked} onChange={gate.setTicked} />
      ) : null}
      {gate.notice === null ? null : (
        <div className={styles["prohibition"]}>
          <p className={styles["text"]}>{gate.notice.line}</p>
        </div>
      )}
    </div>
  );
}

type ActionsProps = Readonly<{
  gate: OrderGate;
  /** The Document has no character other than whitespace. */
  nothing: boolean;
  blocking: number;
  busy: boolean;
  onDownload: (context: OrderContext | null) => void;
  onPrint: () => void;
  onClose: () => void;
}>;

function ExportActions(props: ActionsProps) {
  const { gate, nothing, blocking, busy, onDownload, onPrint, onClose } = props;
  const line = nothing ? NOTHING_TO_EXPORT : blockingLine(blocking);
  return (
    <>
      {line === null ? null : <p className={styles["blockingLine"]}>{line}</p>}
      <ModalActions>
        <button
          type="button"
          disabled={!gate.clear || busy || nothing}
          onClick={() => {
            onDownload(gate.context);
          }}
        >
          {DOWNLOAD_LABEL}
        </button>
        <button type="button" disabled={!gate.clear || nothing} onClick={onPrint}>
          {PRINT_LABEL}
        </button>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </ModalActions>
    </>
  );
}

/** Export_Dialog (Requirements 2, 3, 5, 6): the gate is recomputed on every render. */
export function ExportDialog(props: ExportDialogProps) {
  const { document, store, orderStore, now, notice, busy, restoreFocus, onClose } = props;
  const [target, setTarget] = useState<Target | null>(null);
  const root = useRef<HTMLDivElement | null>(null);
  useReclaimFocus(root, target);
  const gate = useOrderGate(document, orderStore, props.clearNotice);
  const blocking = blockingIssues(document);
  return (
    <>
      <Modal title="Export" wide onClose={onClose} restoreFocus={restoreFocus}>
        <div ref={root} className={styles["body"]}>
          <ExportOrder gate={gate} />
          <ExportBody {...props} blocking={blocking} onOverride={setTarget} />
        </div>
        <p role="status" className={styles["status"]}>
          {notice}
        </p>
        <ExportActions
          gate={gate}
          nothing={!hasExportableText(document)}
          blocking={blocking.length}
          busy={busy}
          onDownload={props.onDownload}
          onPrint={props.onPrint}
          onClose={onClose}
        />
      </Modal>
      <OverrideTarget
        document={document}
        target={target}
        store={store}
        now={now}
        onClose={() => {
          setTarget(null);
        }}
      />
    </>
  );
}
