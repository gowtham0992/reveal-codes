"use client";

import { useState } from "react";
import { pastedDocument } from "../client/pasted-document";
import { openFile } from "../client/open-file";
import { severalFilesOutcome } from "../client/open-outcome";
import type { OpenInput } from "../client/open-file";
import type { OpenOutcome } from "../client/open-outcome";
import type { AppServices } from "../services";
import type { Store } from "../store-runtime";
import { ConfirmDialog } from "./confirm-dialog";
import { useFileDrop } from "./use-file-drop";
import { useOpen } from "./use-open";

type Installable = Exclude<OpenOutcome, { kind: "refused" }>;
type OpenPending = Readonly<{ name: string; outcome: Installable }>;

/** Installs an Open outcome: `replace` first, then `notice` and `openNote`. Same gate behaviour as Load demo. */
function installOutcome(store: Store, svc: AppServices, outcome: Installable): void {
  if (outcome.kind === "restored") {
    store.dispatch({
      type: "replace",
      document: outcome.document,
      runLog: [],
      verifiedAt: null,
      declaration: outcome.declaration,
    });
  } else {
    const doc = pastedDocument(outcome.text, svc.now().toISOString());
    if (typeof doc === "string") {
      store.dispatch({ type: "notice", text: doc });
      return;
    }
    store.dispatch({
      type: "replace",
      document: doc,
      runLog: [],
      verifiedAt: null,
      declaration: null,
    });
  }
  store.dispatch({ type: "notice", text: outcome.notice });
  store.dispatch({ type: "openNote", text: outcome.note });
}

/**
 * Opens one file (Picker and drop both call this): clears the Open_Note, reads and classifies it,
 * asks to confirm only when it was not refused and the draft is non-empty, then installs it.
 */
async function runOpen(
  store: Store,
  svc: AppServices,
  file: OpenInput,
  askOpen: (value: OpenPending) => void,
): Promise<void> {
  store.dispatch({ type: "openNote", text: null });
  const outcome = await openFile(file);
  if (outcome.kind === "refused") {
    store.dispatch({ type: "notice", text: outcome.notice });
    store.dispatch({ type: "openNote", text: outcome.note });
  } else if (store.getState().document.text.length === 0) installOutcome(store, svc, outcome);
  else askOpen({ name: file.name, outcome });
}

/** A drop of several files: the refusal path of Requirement 14 criterion 8, opening none. */
function refuseSeveral(store: Store): void {
  const refused = severalFilesOutcome();
  if (refused.kind !== "refused") return;
  store.dispatch({ type: "openNote", text: null });
  store.dispatch({ type: "notice", text: refused.notice });
  store.dispatch({ type: "openNote", text: refused.note });
}
/**
 * Open: the Picker, the confirm dialog and `openDraft(file)`, the one function a drop also calls.
 * Installs through `replace` like Load demo motion, so the Draft_Gate behaviour is the same.
 */
export function useOpenDraft(store: Store, svc: AppServices) {
  const [pending, setPending] = useState<OpenPending | null>(null);
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  const openDraft = (file: OpenInput): void => {
    const active = document.activeElement;
    setOpener(active instanceof HTMLElement ? active : null);
    void runOpen(store, svc, file, setPending);
  };
  const picker = useOpen(openDraft);
  useFileDrop({
    onFile: openDraft,
    onSeveral: () => {
      refuseSeveral(store);
    },
  });
  const close = (): void => {
    setPending(null);
  };
  const openInput = { ref: picker.inputRef, accept: picker.accept, onChange: picker.onChange };
  return {
    api: { openDraft, onOpen: picker.openPicker, openInput },
    dialog:
      pending === null ? null : (
        <ConfirmDialog
          title="Open a draft"
          message={`Discard the current draft and open ${pending.name}?`}
          confirmLabel="Discard and open"
          restoreFocus={opener}
          onConfirm={() => {
            close();
            installOutcome(store, svc, pending.outcome);
          }}
          onCancel={close}
        />
      ),
  };
}
