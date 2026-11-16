"use client";

import type { Document } from "@reveal-codes/engine";
import { needsCheckDate } from "../client/check-date";
import { countVerifiableUnchecked } from "../client/verify-flow";
import { nextStep } from "./next-step";
import { Toolbar } from "./toolbar";
import type { useExport } from "./use-export";
import type { useDocumentActions } from "./use-document-actions";
import type { usePaneControl } from "./use-pane";
import { WAITING_TEXT } from "./use-verify";
import type { VerifyControl } from "./use-verify";

export type ShellToolbarProps = Readonly<{
  notice: string | null;
  doc: Document;
  verifiedAt: string | null;
  verify: Pick<VerifyControl, "running" | "waiting" | "start" | "disabled">;
  exportGate: ReturnType<typeof useExport>;
  pane: ReturnType<typeof usePaneControl>;
  actions: ReturnType<typeof useDocumentActions>;
}>;

export function ShellToolbar(props: ShellToolbarProps) {
  const { notice, doc, verifiedAt, exportGate, pane, actions, verify } = props;
  const step = nextStep({
    empty: doc.text.length === 0,
    verifying: verify.running,
    verifiableUnchecked: countVerifiableUnchecked(doc),
    needsCheckDate: needsCheckDate(doc, verifiedAt),
    blocking: exportGate.toolbar.blockingCount,
  });
  return (
    <Toolbar
      notice={verify.waiting ? WAITING_TEXT : notice}
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
