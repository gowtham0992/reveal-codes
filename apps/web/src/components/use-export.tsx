"use client";

import { blockingIssues } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import { ORDERS } from "@reveal-codes/export";
import type { OrderContext } from "@reveal-codes/export";
import { useEffect, useMemo, useState } from "react";
import type { Autosave } from "../autosave";
import { exportDocx } from "../client/export-docx";
import type { DraftGate } from "../draft-gate";
import { PRINT_BLOCKED, PRINT_FAILED } from "../notices";
import { createOrderSelectionStore } from "../order-selection";
import type { AppServices } from "../services";
import type { Store } from "../store-runtime";
import { ExportDialog, hasExportableText } from "./export-dialog";

export type UseExportArgs = Readonly<{
  svc: AppServices;
  store: Store;
  autosave: Autosave;
  gate: DraftGate;
  /** The live Document from the Store slice; the gate is recomputed from it each render. */
  doc: Document;
  notice: string | null;
  /** Select the Offset and focus the Editor. */
  onGo: (offset: number) => void;
}>;

/** Print: schedule, flush, then open; either failing keeps the dialog open (Req 2.11). */
function printFlow(svc: AppServices, store: Store, autosave: Autosave, gate: DraftGate): void {
  if (gate.blocked()) {
    store.dispatch({ type: "notice", text: PRINT_BLOCKED });
    return;
  }
  const { document, runLog, verifiedAt, declaration } = store.getState();
  autosave.schedule(document, runLog, verifiedAt, declaration);
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

/** Open flag and the element that opened the dialog, for focus restore. */
function useOpenState() {
  const [open, setOpen] = useState(false);
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  return {
    open,
    opener,
    close: (): void => {
      setOpen(false);
    },
    show: (): void => {
      const active = document.activeElement;
      setOpener(active instanceof HTMLElement ? active : null);
      setOpen(true);
    },
  };
}

/** Owns open, opener and busy for the Export_Dialog; the toolbar button is disabled while the Document is only whitespace. */
export function useExport({ svc, store, autosave, gate, doc, notice, onGo }: UseExportArgs) {
  const { open, opener, close, show } = useOpenState();
  const [busy, setBusy] = useState(false);
  const orderStore = useMemo(() => createOrderSelectionStore(svc.storage, ORDERS), [svc.storage]);
  const setGoTo = useDeferredGo(open, onGo);
  const clearNotice = (): void => {
    store.dispatch({ type: "notice", text: null });
  };
  return {
    toolbar: {
      blockingCount: blockingIssues(doc).length,
      exportDisabled: !hasExportableText(doc),
      onExport: (): void => {
        clearNotice();
        show();
      },
    },
    dialog: open ? (
      <ExportDialog
        document={doc}
        store={store}
        orderStore={orderStore}
        now={svc.now}
        notice={notice}
        clearNotice={clearNotice}
        busy={busy}
        restoreFocus={opener}
        onGo={setGoTo}
        onDownload={(context) => {
          startDownload(svc, store, setBusy, close, context);
        }}
        onPrint={() => {
          printFlow(svc, store, autosave, gate);
        }}
        onClose={close}
      />
    ) : null,
  };
}
