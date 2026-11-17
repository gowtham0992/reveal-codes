"use client";

import { useEffect, useState } from "react";
import { textOutcome } from "../client/open-outcome";
import { takeHandover } from "../handover";
import type { AppServices } from "../services";
import type { Store } from "../store-runtime";
import { ConfirmDialog } from "./confirm-dialog";
import { installOutcome } from "./use-open-draft";
import type { Installable } from "./use-open-draft";

const HANDOVER_NAME = "the draft from the checker";

function capitalise(sentence: string): string {
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/** Installs a taken hand-over, or returns the outcome to confirm when the draft is not empty. */
function receive(store: Store, svc: AppServices, text: string): Installable | null {
  const outcome = textOutcome(HANDOVER_NAME, text, { notes: false, note: null });
  if (outcome.kind === "refused") {
    store.dispatch({ type: "notice", text: capitalise(outcome.notice) });
    store.dispatch({ type: "openNote", text: capitalise(outcome.note) });
    return null;
  }
  if (store.getState().document.text.length === 0) {
    installOutcome(store, svc, outcome);
    return null;
  }
  return outcome;
}

/**
 * Reads the Hand_Over from the Check_Page once on mount (the key is removed by the read), and
 * installs it as pasted text. A non-empty draft asks first; cancel keeps the draft.
 * Runs after `useAutosave`, so the stored draft is already in the Store when it is read.
 */
export function useHandover(store: Store, svc: AppServices) {
  const [pending, setPending] = useState<Installable | null>(null);
  useEffect(() => {
    const text = takeHandover(svc.session);
    if (text === null) return;
    const outcome = receive(store, svc, text);
    if (outcome !== null) setPending(outcome);
  }, [store, svc]);
  const close = (): void => {
    setPending(null);
  };
  return pending === null ? null : (
    <ConfirmDialog
      title="Open a draft"
      message="Discard the current draft and open the draft from the checker?"
      confirmLabel="Discard and open"
      onConfirm={() => {
        close();
        installOutcome(store, svc, pending);
      }}
      onCancel={close}
    />
  );
}
