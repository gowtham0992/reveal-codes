"use client";

import { Modal, ModalActions } from "./modal";

export const EXPORT_PLACEHOLDER =
  "Export and certification are provided by the export-certification spec. They are not built into this editor yet.";

export type ExportDialogProps = Readonly<{
  restoreFocus?: HTMLElement | null | undefined;
  onClose: () => void;
}>;

/** Placeholder shown when Export is enabled (Requirement 19). No DOCX, PDF or certification here. */
export function ExportDialog({ restoreFocus, onClose }: ExportDialogProps) {
  return (
    <Modal title="Export" onClose={onClose} restoreFocus={restoreFocus}>
      <p>{EXPORT_PLACEHOLDER}</p>
      <ModalActions>
        <button type="button" data-autofocus="" onClick={onClose}>
          Close
        </button>
      </ModalActions>
    </Modal>
  );
}
