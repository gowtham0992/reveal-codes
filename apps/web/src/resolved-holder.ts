import type { ResolvedSession } from "./client/resolved";

/**
 * The one place the editor's Display_Info session lives (Requirement 25). `useVerify` writes a
 * completed run into it, the mount-time load seeds it on a restore, and autosave prunes it and
 * stores it. It sits beside the Store, as the Draft_Gate does, so the Store never holds it.
 */
export type ResolvedHolder = Readonly<{
  get: () => ResolvedSession;
  set: (next: ResolvedSession) => void;
  subscribe: (fn: () => void) => () => void;
}>;

export function createResolvedHolder(): ResolvedHolder {
  let current: ResolvedSession = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set(next) {
      if (next === current) return;
      current = next;
      for (const fn of [...listeners]) fn();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}
