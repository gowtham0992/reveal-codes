import { useEffect } from "react";
import type { Autosave } from "../autosave";
import type { DraftGate } from "../draft-gate";
import { AUTOSAVE_KEY, deserialise, readRaw } from "../persist";
import { NARROW_WIDTH } from "../services";
import type { AppServices } from "../services";
import type { Store } from "../store-runtime";

/**
 * Mount-time load (Requirements 9.3, 23.1): an absent value leaves the empty Document. A value
 * that is present but cannot be restored blocks the gate and leaves the Document empty; nothing is
 * written. A thrown read leaves the gate open (23.2).
 */
export function loadAutosave(services: AppServices, store: Store, gate?: DraftGate): void {
  const stored = readRaw(services.storage, AUTOSAVE_KEY);
  if (!("raw" in stored)) return;
  const restored = deserialise(stored.raw);
  if (!restored.ok) {
    if (restored.error.kind !== "absent") gate?.block();
    return;
  }
  store.dispatch({
    type: "replace",
    document: restored.value.document,
    runLog: restored.value.runLog,
    verifiedAt: restored.value.verifiedAt,
    declaration: restored.value.declaration,
  });
}

/**
 * Schedules a save whenever the Document, Run_Log or verifiedAt changes and flushes when the page
 * is hidden. Returns the stop function, which flushes once and removes every listener.
 */
export function startAutosave(
  services: AppServices,
  store: Store,
  autosave: Autosave,
  gate?: DraftGate,
): () => void {
  loadAutosave(services, store, gate);
  let last = store.getState();
  const unsubscribe = store.subscribe(() => {
    const next = store.getState();
    const changed =
      next.document !== last.document ||
      next.runLog !== last.runLog ||
      next.verifiedAt !== last.verifiedAt ||
      next.declaration !== last.declaration;
    if (changed) autosave.schedule(next.document, next.runLog, next.verifiedAt, next.declaration);
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
}

/** Below NARROW_WIDTH it neither loads nor subscribes (Req 10.7, 10.8). */
export function useAutosave(
  store: Store,
  services: AppServices,
  autosave: Autosave,
  gate?: DraftGate,
): void {
  useEffect(() => {
    if (services.viewport.width() < NARROW_WIDTH) return;
    return startAutosave(services, store, autosave, gate);
  }, [store, services, autosave, gate]);
}
