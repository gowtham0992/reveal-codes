"use client";

import { useState } from "react";
import type { Document } from "@reveal-codes/engine";
import type { AppServices } from "../services";
import type { Store } from "../store-runtime";
import { countVerifiableUnchecked, hasFullRecord, runVerifyFlow } from "../client/verify-flow";
import { nextStep } from "./next-step";
import { Toolbar } from "./toolbar";
import type { useExport } from "./use-export";
import type { useDocumentActions } from "./use-document-actions";
import type { usePaneControl } from "./use-pane";

/** Verify wiring (Requirement 17.1): one flow at a time; the flow reports through the Store. */
function useVerify(svc: AppServices, store: Store) {
  const [running, setRunning] = useState(false);
  const start = (): void => {
    setRunning(true);
    void runVerifyFlow(svc.api, store, svc.now).then(() => {
      setRunning(false);
    });
  };
  return { running, start };
}

export type ShellToolbarProps = Readonly<{
  notice: string | null;
  doc: Document;
  svc: AppServices;
  store: Store;
  exportGate: ReturnType<typeof useExport>;
  pane: ReturnType<typeof usePaneControl>;
  actions: ReturnType<typeof useDocumentActions>;
}>;

export function ShellToolbar(props: ShellToolbarProps) {
  const { notice, doc, exportGate, pane, actions } = props;
  const verify = useVerify(props.svc, props.store);
  const step = nextStep({
    empty: doc.text.length === 0,
    verifying: verify.running,
    verifiableUnchecked: countVerifiableUnchecked(doc),
    blocking: exportGate.toolbar.blockingCount,
  });
  return (
    <Toolbar
      notice={notice}
      step={step}
      onNew={actions.onNew}
      onLoadDemo={actions.onLoadDemo}
      paneOpen={pane.open}
      verifyDisabled={verify.running || !hasFullRecord(doc)}
      verifyRunning={verify.running}
      {...exportGate.toolbar}
      onVerify={verify.start}
      onTogglePane={pane.toggle}
    />
  );
}
