import { initialState, reduce } from "./store";
import type { ActionResult, StoreAction, StoreState } from "./store";

export type Store = Readonly<{
  getState(): StoreState;
  /** Synchronous; callers read `error`, `skipped` and `caret` from the result. */
  dispatch(action: StoreAction): ActionResult;
  /** Returns an unsubscribe function. Shaped for `useSyncExternalStore`. */
  subscribe(listener: () => void): () => void;
}>;

export function createStore(now: () => Date): Store {
  let state = initialState(now);
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    dispatch(action) {
      const outcome = reduce(state, action, now);
      if (outcome.state !== state) {
        state = outcome.state;
        for (const listener of [...listeners]) listener();
      }
      return outcome;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
