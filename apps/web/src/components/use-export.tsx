"use client";

import { blockingIssues } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import { useEffect, useState } from "react";
import type { Autosave } from "../autosave";
import { exportDocx } from "../client/export-docx";
import { PRINT_FAILED } from "../notices";
import type { AppServices } from "../services";
import type { Store } from "../store-runtime";
import { ExportDialog } from "./export-dialog";

export type UseExportArgs = Readonly<{
  svc: AppServices;
  store: Store;
  autosave: Autosave;
  /** The live Document from the Store slice; the gate is recomputed from it each render. */
  doc: Document;
  notice: string | null;
  /** Select the Offset and focus the Editor. */
  onGo: (offset: number) => void;
}>;

/** Print: schedule, flush, then open; either failing keeps the dialog open (Req 2.11). */
function printFlow(svc: AppServices, store: Store, autosave: Autosave): void {
  const { document, runLog, verifiedAt } = store.getState();
  autosave.schedule(document, runLog, verifiedAt);
  if (!autosave.flush() || !svc.openPrint()) {
    store.dispatch({ type: "notice", text: PRINT_FAILED });
  }
}

/** Download: busy while packing; the dialog closes only when the file was handed over. */
function startDownload(
  svc: AppServices,
  store: Store,
  setBusy: (busy: boolean) => void,
  close: () => void,
): void {
  setBusy(true);
  void exportDocx(store, { now: svc.now, download: svc.download }).then((outcome) => {
    setBusy(false);
    if (outcome.status === "exported") close();
  });
}

/** Defers Go until the dialog has unmounted and restored focus, so the Editor keeps it. */
function useDeferredGo(open: boolean, onGo: (offset: number) => void) {
  const [goTo, setGoTo] = useState<number | null>(null);
  useEffect(() => {
    if (goTo === null || open) return;
    onGo(goTo);
    setGoTo(null);
  }, [goTo, open, onGo]);
  return setGoTo;
}

/** Owns open, opener and busy for the Export_Dialog; the toolbar button is always enabled. */
export function useExport({ svc, store, autosave, doc, notice, onGo }: UseExportArgs) {
  const [open, setOpen] = useState(false);
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const setGoTo = useDeferredGo(open, onGo);
  const close = (): void => {
    setOpen(false);
  };
  return {
    toolbar: {
      blockingCount: blockingIssues(doc).length,
      onExport: (): void => {
        const active = document.activeElement;
        setOpener(active instanceof HTMLElement ? active : null);
        setOpen(true);
      },
    },
    dialog: open ? (
      <ExportDialog
        document={doc}
        store={store}
        now={svc.now}
        notice={notice}
        busy={busy}
        restoreFocus={opener}
        onGo={setGoTo}
        onDownload={() => {
          startDownload(svc, store, setBusy, close);
        }}
        onPrint={() => {
          printFlow(svc, store, autosave);
        }}
        onClose={close}
      />
    ) : null,
  };
}
