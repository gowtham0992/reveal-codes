import type { AutosaveDeps, StorageLike } from "./autosave";
import { browserApi } from "./client/api";
import type { ApiClient } from "./client/api";
import { browserDownload } from "./client/download";

/** Builds `browserApi()` on first call, so server rendering never touches `fetch`. */
function lazyApi(): ApiClient {
  return {
    verify: (records, signal) => browserApi().verify(records, signal),
    opinion: (clusterId, signal) => browserApi().opinion(clusterId, signal),
    mode: () => browserApi().mode(),
    demoMotion: () => browserApi().demoMotion(),
    aviancaCitations: () => browserApi().aviancaCitations(),
    draft: (prompt, context, onChunk, signal) =>
      browserApi().draft(prompt, context, onChunk, signal),
  };
}

/** Below this width the Small_Screen_Page replaces the shell. */
export const NARROW_WIDTH = 800;
/** Minimum width of the shell itself. */
export const SHELL_MIN_WIDTH = 1150;

/** Window width and a change subscription; `subscribe` returns the unsubscribe function. */
export type Viewport = Readonly<{
  width: () => number;
  subscribe: (onChange: () => void) => () => void;
}>;

function browserViewport(): Viewport {
  return {
    width: () => window.innerWidth,
    subscribe: (onChange) => {
      window.addEventListener("resize", onChange);
      return () => {
        window.removeEventListener("resize", onChange);
      };
    },
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
  download: (bytes: Uint8Array, fileName: string, mime?: string) => void;
  /** True when the print tab opened. */
  openPrint: () => boolean;
  viewport: Viewport;
}>;

/** No `noopener` feature: it makes `window.open` return null even on success. */
function openPrintTab(): boolean {
  const w = window.open("/print", "_blank");
  if (w === null) return false;
  w.opener = null;
  return true;
}

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
    download: (bytes, fileName, mime) => {
      if (mime === undefined) browserDownload(bytes, fileName);
      else browserDownload(bytes, fileName, mime);
    },
    openPrint: openPrintTab,
    viewport: browserViewport(),
  };
}
