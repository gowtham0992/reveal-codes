import type { CheckDone, CheckResult } from "./run-check";

export type CheckState = Readonly<{
  text: string;
  /** Bumped by every edit and by Clear. */
  generation: number;
  running: null | Readonly<{ generation: number; waiting: boolean }>;
  /** The last completed run that was not discarded. */
  results: null | CheckDone;
  /** An edit happened after `results` was produced. */
  stale: boolean;
  /** Refusal or failure sentence of the last run. */
  message: string | null;
  /** The Open success or refusal sentence. */
  openNote: string | null;
}>;

export type CheckAction =
  | { type: "edit"; text: string }
  | { type: "clear" }
  | { type: "start" }
  | { type: "waiting" }
  | { type: "finish"; generation: number; result: CheckResult }
  | { type: "note"; text: string | null };

export const INITIAL_CHECK_STATE: CheckState = {
  text: "",
  generation: 0,
  running: null,
  results: null,
  stale: false,
  message: null,
  openNote: null,
};

function finishCurrent(state: CheckState, result: CheckResult): CheckState {
  switch (result.kind) {
    case "done":
      return { ...state, running: null, results: result, stale: false, message: null };
    case "message":
      return { ...state, running: null, message: result.text };
    case "discarded":
      return { ...state, running: null };
  }
}

export function reduceCheck(state: CheckState, action: CheckAction): CheckState {
  switch (action.type) {
    case "edit":
      if (action.text === state.text) return state;
      return {
        ...state,
        text: action.text,
        generation: state.generation + 1,
        stale: state.results !== null,
      };
    case "clear":
      return {
        ...state,
        text: "",
        generation: state.generation + 1,
        results: null,
        stale: false,
        message: null,
        openNote: null,
      };
    case "start":
      return {
        ...state,
        running: { generation: state.generation, waiting: false },
        message: null,
      };
    case "waiting":
      return state.running === null
        ? state
        : { ...state, running: { ...state.running, waiting: true } };
    case "finish":
      if (action.generation !== state.generation) return { ...state, running: null };
      return finishCurrent(state, action.result);
    case "note":
      return { ...state, openNote: action.text };
  }
}
