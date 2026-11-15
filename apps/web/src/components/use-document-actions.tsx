"use client";

import { apply, createDocument } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import { useState } from "react";
import type { Autosave } from "../autosave";
import { noticeForError } from "../notices";
import type { AppServices } from "../services";
import type { Store } from "../store-runtime";
import { ConfirmDialog } from "./confirm-dialog";

export const DEMO_FAILED = "Could not load the demo motion.";

export const AVIANCA_FAILED =
  "The Avianca citations could not be loaded. Your document is unchanged.";

export type SampleKey = "demo" | "avianca";
type Pending = "new" | SampleKey;

/** One PST insert over an empty Document; the whole text is a single span (Requirement 20). */
function pastedDocument(text: string, iso: string): Document | string {
  const empty = createDocument("", iso);
  if (!empty.ok) return noticeForError(empty.error);
  const inserted = apply(empty.value, {
    kind: "insert",
    at: 0,
    text,
    provenance: { origin: "PST", timestamp: iso },
  });
  return inserted.ok ? inserted.value.document : noticeForError(inserted.error);
}

function installDocument(store: Store, svc: AppServices, text: string): void {
  const doc = pastedDocument(text, svc.now().toISOString());
  if (typeof doc === "string") store.dispatch({ type: "notice", text: doc });
  else store.dispatch({ type: "replace", document: doc });
}

async function loadSample(store: Store, svc: AppServices, key: SampleKey): Promise<void> {
  const fetched = await (key === "demo" ? svc.api.demoMotion() : svc.api.aviancaCitations());
  if (!fetched.ok) {
    store.dispatch({ type: "notice", text: key === "demo" ? DEMO_FAILED : AVIANCA_FAILED });
  } else installDocument(store, svc, fetched.value);
}

function startNew(store: Store, svc: AppServices, autosave: Autosave): void {
  installDocument(store, svc, "");
  autosave.clear();
}

type Deps = Readonly<{ store: Store; svc: AppServices; autosave: Autosave; doc: Document }>;

const COPY = {
  new: {
    title: "New document",
    message: "Discard the current draft and start a new document?",
    confirmLabel: "Discard and start new",
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

/** New and Load demo motion: both confirm first (Load demo only when the draft is non-empty). */
export function useDocumentActions({ store, svc, autosave, doc }: Deps) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  const ask = (kind: Pending): void => {
    const active = document.activeElement;
    setOpener(active instanceof HTMLElement ? active : null);
    setPending(kind);
  };
  const run = (kind: Pending): void => {
    if (kind === "new") startNew(store, svc, autosave);
    else void loadSample(store, svc, kind);
  };
  const confirm = (): void => {
    const kind = pending;
    setPending(null);
    if (kind !== null) run(kind);
  };
  return {
    onNew: (): void => {
      ask("new");
    },
    onLoadDemo: (): void => {
      if (doc.text.length === 0) run("demo");
      else ask("demo");
    },
    onLoadSample: (key: SampleKey): void => {
      if (doc.text.length === 0) run(key);
      else ask(key);
    },
    dialog:
      pending === null ? null : (
        <ConfirmDialog
          {...COPY[pending]}
          restoreFocus={opener}
          onConfirm={confirm}
          onCancel={() => {
            setPending(null);
          }}
        />
      ),
  };
}
