"use client";
import { useEffect, useRef } from "react";
import type { Dispatch } from "react";
import { WAITING_AFTER_MS } from "../components/use-verify";
import type { AppServices } from "../services";
import type { CheckAction, CheckState } from "./check-state";
import { runCheck } from "./run-check";

type Timer = { handle: unknown } | null;

/**
 * One Check_Run at a time. The waiting timer is armed on start and cleared on finish, on
 * Clear and on unmount; a run for older text is dropped by the reducer, not here.
 */
export function useCheckRun(svc: AppServices, state: CheckState, dispatch: Dispatch<CheckAction>) {
  const timer = useRef<Timer>(null);
  const stop = (): void => {
    if (timer.current !== null) svc.clearTimer(timer.current.handle);
    timer.current = null;
  };
  useEffect(
    () => () => {
      if (timer.current !== null) svc.clearTimer(timer.current.handle);
      timer.current = null;
    },
    [svc],
  );
  const onCheck = (): void => {
    if (state.running !== null) return;
    const generation = state.generation;
    dispatch({ type: "start" });
    timer.current = {
      handle: svc.setTimer(() => {
        dispatch({ type: "waiting" });
      }, WAITING_AFTER_MS),
    };
    void runCheck({ text: state.text, api: svc.api, now: svc.now }).then((result) => {
      stop();
      dispatch({ type: "finish", generation, result });
    });
  };
  return { onCheck, stopWaiting: stop };
}
