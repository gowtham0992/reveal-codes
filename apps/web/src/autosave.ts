import type { Document } from "@reveal-codes/engine";
import { AUTOSAVE_KEY, serialise } from "./persist";
import type { RunLogEntry } from "./store";

export const AUTOSAVE_DEBOUNCE_MS = 300;
export const AUTOSAVE_FAILED = "Autosave failed. Your draft is kept in this tab only.";

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type AutosaveDeps = Readonly<{
  storage: StorageLike;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  onError: (message: string) => void;
}>;

export type Autosave = Readonly<{
  /** Debounced write of the latest value (300 ms). */
  schedule(document: Document, runLog: readonly RunLogEntry[], verifiedAt: string | null): void;
  /** Writes a pending value now. True when nothing was pending or the write succeeded. */
  flush(): boolean;
  /** Cancels a pending write and removes the stored key. */
  clear(): void;
}>;

type Pending = Readonly<{
  document: Document;
  runLog: readonly RunLogEntry[];
  verifiedAt: string | null;
}>;

type Failure = Readonly<{ thrown: unknown }>;

/** Boundary for `localStorage`, which throws on quota or private mode (Req 9.6): the throw becomes a value. */
function storageFailure(action: () => void): Failure | null {
  try {
    action();
    return null;
  } catch (e) {
    return { thrown: e };
  }
}

type TimerSlot = Readonly<{ cancel: () => void; start: (fn: () => void) => void }>;

function createTimerSlot(deps: AutosaveDeps): TimerSlot {
  let handle: unknown = null;
  let hasHandle = false;
  return {
    cancel() {
      if (hasHandle) deps.clearTimer(handle);
      hasHandle = false;
      handle = null;
    },
    start(fn) {
      handle = deps.setTimer(fn, AUTOSAVE_DEBOUNCE_MS);
      hasHandle = true;
    },
  };
}

/** Writes one job; reports failure through `onError` and the return value. */
function writeJob(deps: AutosaveDeps, job: Pending): boolean {
  const text = serialise(job.document, job.runLog, job.verifiedAt);
  const failure = storageFailure(() => {
    deps.storage.setItem(AUTOSAVE_KEY, text);
  });
  if (failure === null) return true;
  deps.onError(AUTOSAVE_FAILED);
  return false;
}

export function createAutosave(deps: AutosaveDeps): Autosave {
  let pending: Pending | null = null;
  const slot = createTimerSlot(deps);
  const cancelTimer = slot.cancel;

  const write = (): boolean => {
    cancelTimer();
    const job = pending;
    pending = null;
    return job === null ? true : writeJob(deps, job);
  };

  return {
    schedule(document, runLog, verifiedAt) {
      pending = { document, runLog, verifiedAt };
      cancelTimer();
      slot.start(() => {
        write();
      });
    },
    flush: write,
    clear() {
      cancelTimer();
      pending = null;
      const removal = storageFailure(() => {
        deps.storage.removeItem(AUTOSAVE_KEY);
      });
      if (removal !== null) {
        deps.onError(AUTOSAVE_FAILED);
      }
    },
  };
}
