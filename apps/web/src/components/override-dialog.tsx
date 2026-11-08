"use client";

import type { IssueKey } from "@reveal-codes/engine";
import { useId, useState } from "react";
import type { Store } from "../store-runtime";
import { Modal, ModalActions } from "./modal";
import styles from "./override-dialog.module.css";

export const MIN_REASON_LENGTH = 10;
export const REASON_HINT = `Enter at least ${String(MIN_REASON_LENGTH)} characters.`;
export const PRINTED_STATEMENT = "The reason is printed in the certification.";

export type OverrideDialogProps = Readonly<{
  issueKey: IssueKey;
  code: string;
  store: Store;
  now: () => Date;
  restoreFocus: HTMLElement | null;
  onClose: () => void;
}>;

/** Reason state and the `override` dispatch; the reason is stored as typed (Req 18.7, 18.8). */
function useOverrideForm(props: OverrideDialogProps) {
  const { issueKey, store, now, onClose } = props;
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const valid = reason.trim().length >= MIN_REASON_LENGTH;
  const save = (): void => {
    const outcome = store.dispatch({
      type: "override",
      key: issueKey,
      reason,
      timestamp: now().toISOString(),
    });
    if (outcome.error === null) onClose();
    else setError(outcome.error.kind);
  };
  return { reason, setReason, error, valid, save };
}

/** Override_Dialog (Requirements 18.5 to 18.9). */
export function OverrideDialog(props: OverrideDialogProps) {
  const { code, restoreFocus, onClose } = props;
  const fieldId = useId();
  const hintId = useId();
  const { reason, setReason, error, valid, save } = useOverrideForm(props);
  return (
    <Modal title={`Override ${code}`} onClose={onClose} restoreFocus={restoreFocus}>
      <p className={styles["statement"]}>{PRINTED_STATEMENT}</p>
      <label htmlFor={fieldId} className={styles["label"]}>
        Reason
      </label>
      <textarea
        id={fieldId}
        data-autofocus=""
        className={styles["field"]}
        rows={4}
        value={reason}
        aria-describedby={hintId}
        onChange={(e) => {
          setReason(e.target.value);
        }}
      />
      <p id={hintId} className={styles["hint"]}>
        {valid ? "" : REASON_HINT}
      </p>
      {error === null ? null : (
        <p role="alert" className={styles["error"]}>{`Could not save the override: ${error}.`}</p>
      )}
      <ModalActions>
        <button type="button" disabled={!valid} onClick={save}>
          Save override
        </button>
        <button type="button" onClick={onClose}>
          Cancel
        </button>
      </ModalActions>
    </Modal>
  );
}
