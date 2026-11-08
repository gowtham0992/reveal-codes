import type { AutosaveDeps, StorageLike } from "./autosave";

/**
 * Browser services the shell depends on. Tests supply fakes.
 * The `api` client is added with the Verify flow (task 6.5).
 */
export type AppServices = Readonly<{
  now: () => Date;
  setTimer: AutosaveDeps["setTimer"];
  clearTimer: AutosaveDeps["clearTimer"];
  storage: StorageLike;
}>;

/**
 * Every browser global is read lazily, inside a method, so building the
 * services during server rendering never touches `window` or `localStorage`.
 */
export function defaultServices(): AppServices {
  return {
    now: () => new Date(),
    setTimer: (fn, ms) => window.setTimeout(fn, ms),
    clearTimer: (handle) => {
      window.clearTimeout(handle as number);
    },
    storage: {
      getItem: (key) => window.localStorage.getItem(key),
      setItem: (key, value) => {
        window.localStorage.setItem(key, value);
      },
      removeItem: (key) => {
        window.localStorage.removeItem(key);
      },
    },
  };
}
