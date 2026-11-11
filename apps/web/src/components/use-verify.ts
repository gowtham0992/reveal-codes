"use client";

import { useEffect, useRef, useState } from "react";
import type { AppServices } from "../services";
import type { Store } from "../store-runtime";
import { hasFullRecord, runVerifyFlow } from "../client/verify-flow";
import { furtherLine } from "../client/verify-summary";

/** A run in flight this long is probably held by the citation service's request bucket. */
export const WAITING_AFTER_MS = 5000;
export const WAITING_TEXT =
  "Verifying… waiting for the citation service's rate limit. This can take up to a minute.";
export type VerifyControl = Readonly<{
  running: boolean;
  /** True once the run has been in flight for WAITING_AFTER_MS; false again when it ends. */
  waiting: boolean;
  start: () => void;
  disabled: boolean;
  /** The further line of the last completed run; null until then or when there is none. */
  note: string | null;
}>;

type Pending = { handle: unknown } | null;
/** The waiting flag: set by an injected timer once a run is slow, cleared when it ends or unmounts. */
function useWaiting(
  svc: AppServices,
): Readonly<{ waiting: boolean; arm: () => void; disarm: () => void }> {
  const [waiting, setWaiting] = useState(false);
  const pending = useRef<Pending>(null);
  const disarm = (): void => {
    if (pending.current !== null) svc.clearTimer(pending.current.handle);
    pending.current = null;
    setWaiting(false);
  };
  const arm = (): void => {
    pending.current = {
      handle: svc.setTimer(() => {
        pending.current = null;
        setWaiting(true);
      }, WAITING_AFTER_MS),
    };
  };
  useEffect(
    () => () => {
      if (pending.current !== null) svc.clearTimer(pending.current.handle);
    },
    [svc],
  );
  return { waiting, arm, disarm };
}
/** Verify wiring (Requirement 17.1): one flow at a time; the flow reports through the Store. */
export function useVerify(svc: AppServices, store: Store): VerifyControl {
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const { waiting, arm, disarm } = useWaiting(svc);
  const start = (): void => {
    setRunning(true);
    arm();
    void runVerifyFlow(svc.api, store, svc.now).then((outcome) => {
      if (outcome.status === "completed") setNote(furtherLine(outcome, store.getState().document));
      disarm();
      setRunning(false);
    });
  };
  const disabled = running || !hasFullRecord(store.getState().document);
  return { running, waiting, start, disabled, note };
}
