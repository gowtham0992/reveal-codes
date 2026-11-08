import type { AutosaveDeps, StorageLike } from "./autosave";
import { browserApi } from "./client/api";
import type { ApiClient } from "./client/api";

/** Builds `browserApi()` on first call, so server rendering never touches `fetch`. */
function lazyApi(): ApiClient {
  return {
    verify: (records, signal) => browserApi().verify(records, signal),
    opinion: (clusterId, signal) => browserApi().opinion(clusterId, signal),
    mode: () => browserApi().mode(),
    demoMotion: () => browserApi().demoMotion(),
  };
}

/**
 * Browser services the shell depends on. Tests supply fakes.
 */
export type AppServices = Readonly<{
  api: ApiClient;
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
    api: lazyApi(),
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
