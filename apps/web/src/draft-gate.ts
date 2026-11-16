/**
 * The Draft_Gate: set while the stored draft could not be read. Autosave writes nothing while it
 * is blocked. It lives beside the Store, not in it, so undo, New and property enumeration of
 * StoreState never touch it.
 */
export type DraftGate = Readonly<{
  blocked: () => boolean;
  block: () => void;
  release: () => void;
  subscribe: (fn: () => void) => () => void;
}>;

export function createDraftGate(): DraftGate {
  let isBlocked = false;
  const listeners = new Set<() => void>();

  const set = (next: boolean): void => {
    if (next === isBlocked) return;
    isBlocked = next;
    for (const fn of [...listeners]) fn();
  };

  return {
    blocked: () => isBlocked,
    block: () => {
      set(true);
    },
    release: () => {
      set(false);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}
