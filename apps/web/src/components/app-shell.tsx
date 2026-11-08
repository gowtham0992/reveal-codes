"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createAutosave } from "../autosave";
import type { Autosave } from "../autosave";
import { useEditorBinding } from "../editor/use-editor-binding";
import { AUTOSAVE_KEY, deserialise } from "../persist";
import { defaultServices } from "../services";
import type { AppServices } from "../services";
import { createStore } from "../store-runtime";
import type { Store } from "../store-runtime";
import { EditorSurface } from "./editor-surface";
import { IssuesRegion } from "./issues-region";
import { Toolbar } from "./toolbar";

export type AppShellProps = Readonly<{ services?: AppServices }>;

type Stored = Readonly<{ raw: string | null } | { thrown: unknown }>;

/** `localStorage` access can throw (disabled storage); the throw becomes a value. */
function readStored(services: AppServices): Stored {
  try {
    return { raw: services.storage.getItem(AUTOSAVE_KEY) };
  } catch (e) {
    return { thrown: e };
  }
}

/** Mount-time load (Requirement 9.3): a missing or corrupt value leaves the empty Document. */
function loadAutosave(services: AppServices, store: Store): void {
  const stored = readStored(services);
  if (!("raw" in stored)) return;
  const restored = deserialise(stored.raw);
  if (restored.ok) {
    store.dispatch({
      type: "replace",
      document: restored.value.document,
      runLog: restored.value.runLog,
    });
  }
}

/** Schedules a save whenever the Document or Run_Log changes; flushes when the page is hidden. */
function useAutosave(store: Store, services: AppServices, autosave: Autosave): void {
  useEffect(() => {
    loadAutosave(services, store);
    let last = store.getState();
    const unsubscribe = store.subscribe(() => {
      const next = store.getState();
      if (next.document !== last.document || next.runLog !== last.runLog) {
        autosave.schedule(next.document, next.runLog);
      }
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
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [store, services, autosave]);
}

function useStoreSlice<T>(store: Store, select: (state: ReturnType<Store["getState"]>) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => select(store.getState()),
    () => select(store.getState()),
  );
}

export function AppShell({ services }: AppShellProps) {
  const [svc] = useState<AppServices>(() => services ?? defaultServices());
  const [store] = useState(() => createStore(svc.now));
  const [autosave] = useState(() =>
    createAutosave({
      storage: svc.storage,
      setTimer: svc.setTimer,
      clearTimer: svc.clearTimer,
      onError: (text) => {
        store.dispatch({ type: "notice", text });
      },
    }),
  );
  const binding = useEditorBinding({ store, now: svc.now, onCaret: noCaret });
  useAutosave(store, svc, autosave);
  const notice = useStoreSlice(store, (s) => s.notice);
  const empty = useStoreSlice(store, (s) => s.document.text.length === 0);
  // Pane region (5.3, 5.4) and the cursor Offset state land with the Pane.
  return (
    <div className="app">
      <Toolbar notice={notice} paneOpen={false} verifyDisabled={true} exportDisabled={true} />
      <EditorSurface editor={binding.editor} empty={empty} />
      <IssuesRegion />
    </div>
  );
}

function noCaret(): void {}
