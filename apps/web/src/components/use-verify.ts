"use client";

import { useState } from "react";
import type { AppServices } from "../services";
import type { Store } from "../store-runtime";
import { hasFullRecord, runVerifyFlow } from "../client/verify-flow";
import { furtherLine } from "../client/verify-summary";

export type VerifyControl = Readonly<{
  running: boolean;
  start: () => void;
  disabled: boolean;
  /** The further line of the last completed run; null until then or when there is none. */
  note: string | null;
}>;

/** Verify wiring (Requirement 17.1): one flow at a time; the flow reports through the Store. */
export function useVerify(svc: AppServices, store: Store): VerifyControl {
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const start = (): void => {
    setRunning(true);
    void runVerifyFlow(svc.api, store, svc.now).then((outcome) => {
      if (outcome.status === "completed") setNote(furtherLine(outcome, store.getState().document));
      setRunning(false);
    });
  };
  return { running, start, disabled: running || !hasFullRecord(store.getState().document), note };
}
