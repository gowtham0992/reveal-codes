"use client";

import type { Document } from "@reveal-codes/engine";
import { countVerifiableUnchecked } from "../client/verify-flow";
import { nextStep } from "./next-step";
import { Toolbar } from "./toolbar";
import type { useExport } from "./use-export";
import type { useDocumentActions } from "./use-document-actions";
import type { usePaneControl } from "./use-pane";
import type { VerifyControl } from "./use-verify";

export type ShellToolbarProps = Readonly<{
  notice: string | null;
  doc: Document;
  verify: Pick<VerifyControl, "running" | "start" | "disabled">;
  exportGate: ReturnType<typeof useExport>;
  pane: ReturnType<typeof usePaneControl>;
  actions: ReturnType<typeof useDocumentActions>;
}>;

export function ShellToolbar(props: ShellToolbarProps) {
  const { notice, doc, exportGate, pane, actions, verify } = props;
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
      verifyDisabled={verify.disabled}
      verifyRunning={verify.running}
      {...exportGate.toolbar}
      onVerify={verify.start}
      onTogglePane={pane.toggle}
    />
  );
}
