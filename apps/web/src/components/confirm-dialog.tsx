"use client";

import { Modal, ModalActions } from "./modal";

export type ConfirmDialogProps = Readonly<{
  title: string;
  message: string;
  confirmLabel: string;
  restoreFocus?: HTMLElement | null | undefined;
  onConfirm: () => void;
  onCancel: () => void;
}>;

/** Plain confirmation used by New and Load demo motion (task 7.3). Focus starts on Cancel. */
export function ConfirmDialog(props: ConfirmDialogProps) {
  const { title, message, confirmLabel, restoreFocus, onConfirm, onCancel } = props;
  return (
    <Modal title={title} onClose={onCancel} restoreFocus={restoreFocus}>
      <p>{message}</p>
      <ModalActions>
        <button type="button" onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" data-autofocus="" onClick={onCancel}>
          Cancel
        </button>
      </ModalActions>
    </Modal>
  );
}
