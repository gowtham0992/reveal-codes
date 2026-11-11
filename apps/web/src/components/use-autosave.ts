import { useEffect } from "react";
import type { Autosave } from "../autosave";
import { AUTOSAVE_KEY, deserialise, readRaw } from "../persist";
import { NARROW_WIDTH } from "../services";
import type { AppServices } from "../services";
import type { Store } from "../store-runtime";

/** Mount-time load (Requirement 9.3): a missing or corrupt value leaves the empty Document. */
export function loadAutosave(services: AppServices, store: Store): void {
  const stored = readRaw(services.storage, AUTOSAVE_KEY);
  if (!("raw" in stored)) return;
  const restored = deserialise(stored.raw);
  if (restored.ok) {
    store.dispatch({
      type: "replace",
      document: restored.value.document,
      runLog: restored.value.runLog,
      verifiedAt: restored.value.verifiedAt,
    });
  }
}

/**
 * Schedules a save whenever the Document, Run_Log or verifiedAt changes; flushes when the page is
 * hidden and once on unmount. Below NARROW_WIDTH it neither loads nor subscribes (Req 10.7, 10.8).
 */
export function useAutosave(store: Store, services: AppServices, autosave: Autosave): void {
  useEffect(() => {
    if (services.viewport.width() < NARROW_WIDTH) return;
    loadAutosave(services, store);
    let last = store.getState();
    const unsubscribe = store.subscribe(() => {
      const next = store.getState();
      const changed =
        next.document !== last.document ||
        next.runLog !== last.runLog ||
        next.verifiedAt !== last.verifiedAt;
      if (changed) autosave.schedule(next.document, next.runLog, next.verifiedAt);
      last = next;
    });
    const onVisibility = (): void => {
      if (document.visibilityState === "hidden") autosave.flush();
    };
    const onPageHide = (): void => {
      autosave.flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      autosave.flush();
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [store, services, autosave]);
}
