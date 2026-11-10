"use client";

import { blockingIssues } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import { ORDERS } from "@reveal-codes/export";
import type { OrderContext } from "@reveal-codes/export";
import { useEffect, useMemo, useState } from "react";
import type { Autosave } from "../autosave";
import { exportDocx } from "../client/export-docx";
import { PRINT_FAILED } from "../notices";
import { createOrderSelectionStore } from "../order-selection";
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
  orderContext: OrderContext | null,
): void {
  setBusy(true);
  void exportDocx(store, { now: svc.now, download: svc.download, orderContext }).then((outcome) => {
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
  const orderStore = useMemo(() => createOrderSelectionStore(svc.storage, ORDERS), [svc.storage]);
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
        orderStore={orderStore}
        now={svc.now}
        notice={notice}
        busy={busy}
        restoreFocus={opener}
        onGo={setGoTo}
        onDownload={(context) => {
          startDownload(svc, store, setBusy, close, context);
        }}
        onPrint={() => {
          printFlow(svc, store, autosave);
        }}
        onClose={close}
      />
    ) : null,
  };
}
