"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createResolvedHolder } from "../resolved-holder";
import type { ResolvedHolder } from "../resolved-holder";
import type { AppServices } from "../services";
import type { Store } from "../store-runtime";
import { hasFullRecord, runVerifyFlow } from "../client/verify-flow";
import type { ResolvedSession } from "../client/resolved";
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
  /** The sentence for a failed run, shown in the Issues region; null until one fails and after the next run starts. */
  failure: string | null;
  /**
   * Display_Info of the last completed run, kept in memory and stored with the saved draft (never in
   * the Document); null until a run completes or a draft with saved entries is restored.
   */
  resolved: ResolvedSession;
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
export function useVerify(svc: AppServices, store: Store, holder?: ResolvedHolder): VerifyControl {
  const [own] = useState(() => createResolvedHolder());
  const session = holder ?? own;
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const { waiting, arm, disarm } = useWaiting(svc);
  const resolved = useSyncExternalStore(session.subscribe, session.get, session.get);
  const start = (): void => {
    const epoch = store.getState().epoch;
    setRunning(true);
    setFailure(null);
    arm();
    void runVerifyFlow(svc.api, store, svc.now).then((outcome) => {
      setFailure(outcome.status === "failed" ? (outcome.failure ?? null) : null);
      if (outcome.status === "completed") {
        setNote(furtherLine(outcome, store.getState().document));
        session.set({ epoch, info: new Map(outcome.info ?? []) });
      }
      disarm();
      setRunning(false);
    });
  };
  const disabled = running || !hasFullRecord(store.getState().document);
  return { running, waiting, start, disabled, note, failure, resolved };
}
