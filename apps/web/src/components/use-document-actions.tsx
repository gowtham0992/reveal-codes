"use client";

import type { Document } from "@reveal-codes/engine";
import { docxSafe } from "@reveal-codes/export";
import { useState } from "react";
import type { Autosave } from "../autosave";
import { pastedDocument } from "../client/pasted-document";
import type { DraftGate } from "../draft-gate";
import { SAVE_COPY_FAILED } from "../notices";
import { saveDraftCopy } from "../saved-draft";
import type { AppServices } from "../services";
import type { Store } from "../store-runtime";
import { ConfirmDialog } from "./confirm-dialog";
import { useOpenDraft } from "./use-open-draft";

export const DEMO_FAILED = "Could not load the demo motion.";

export const AVIANCA_FAILED =
  "The Avianca citations could not be loaded. Your document is unchanged.";

export type SampleKey = "demo" | "avianca";
type Pending = "new" | "newBlocked" | SampleKey;

function installDocument(store: Store, svc: AppServices, text: string): void {
  const doc = pastedDocument(text, svc.now().toISOString());
  if (typeof doc === "string") store.dispatch({ type: "notice", text: doc });
  else store.dispatch({ type: "replace", document: doc });
}

async function loadSample(store: Store, svc: AppServices, key: SampleKey): Promise<void> {
  const fetched = await (key === "demo" ? svc.api.demoMotion() : svc.api.aviancaCitations());
  if (!fetched.ok) {
    store.dispatch({ type: "notice", text: key === "demo" ? DEMO_FAILED : AVIANCA_FAILED });
  } else installDocument(store, svc, docxSafe(fetched.value).text);
}

function startNew(store: Store, svc: AppServices, autosave: Autosave): void {
  installDocument(store, svc, "");
  autosave.clear();
}

/** Start a new document over an unreadable draft: the gate opens only when the stored value was removed. */
function startNewBlocked(
  store: Store,
  svc: AppServices,
  autosave: Autosave,
  gate: DraftGate,
): void {
  installDocument(store, svc, "");
  if (autosave.clear()) gate.release();
}

type Deps = Readonly<{
  store: Store;
  svc: AppServices;
  autosave: Autosave;
  gate: DraftGate;
  doc: Document;
}>;

const COPY = {
  new: {
    title: "New document",
    message: "Discard the current draft and start a new document?",
    confirmLabel: "Discard and start new",
  },
  newBlocked: {
    title: "Start a new document",
    message:
      "Delete the saved draft that could not be read and start a new document? Anything on the page is discarded too.",
    confirmLabel: "Delete and start new",
  },
  demo: {
    title: "Load demo motion",
    message: "Replace the current draft with the demo motion?",
    confirmLabel: "Replace draft",
  },
  avianca: {
    title: "Load the Avianca citations",
    message: "Replace the current draft with the Avianca citations?",
    confirmLabel: "Replace draft",
  },
} as const;

function useDialogOpener() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  const ask = (kind: Pending): void => {
    const active = document.activeElement;
    setOpener(active instanceof HTMLElement ? active : null);
    setPending(kind);
  };
  return { pending, setPending, opener, ask };
}

function runPending(kind: Pending, d: Deps): void {
  if (kind === "new") startNew(d.store, d.svc, d.autosave);
  else if (kind === "newBlocked") startNewBlocked(d.store, d.svc, d.autosave, d.gate);
  else void loadSample(d.store, d.svc, kind);
}

function saveCopyOrNotice(svc: AppServices, store: Store): void {
  if (!saveDraftCopy(svc)) store.dispatch({ type: "notice", text: SAVE_COPY_FAILED });
}

/** New and Load demo motion: both confirm first (Load demo only when the draft is non-empty). */
export function useDocumentActions(deps: Deps) {
  const { store, svc, gate, doc } = deps;
  const { pending, setPending, opener, ask } = useDialogOpener();
  const open = useOpenDraft(store, svc);
  const confirm = (): void => {
    setPending(null);
    if (pending !== null) runPending(pending, deps);
  };
  return {
    onNew: (): void => {
      ask(gate.blocked() ? "newBlocked" : "new");
    },
    onStartNewDraft: (): void => {
      ask("newBlocked");
    },
    onSaveDraftCopy: (): void => {
      saveCopyOrNotice(svc, store);
    },
    /** `openDraft(file)` is the one function the Picker and the drop (task 8.4) both call. */
    ...open.api,
    onLoadDemo: (): void => {
      if (doc.text.length === 0) runPending("demo", deps);
      else ask("demo");
    },
    onLoadSample: (key: SampleKey): void => {
      if (doc.text.length === 0) runPending(key, deps);
      else ask(key);
    },
    dialog:
      open.dialog ??
      (pending === null ? null : (
        <ConfirmDialog
          {...COPY[pending]}
          restoreFocus={opener}
          onConfirm={confirm}
          onCancel={() => { setPending(null); }}
        />
      )),
  };
}
