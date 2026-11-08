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
import { hasFullRecord, runVerifyFlow } from "../client/verify-flow";
import { EditorSurface } from "./editor-surface";
import { ModeBadge, useServerMode } from "./mode-badge";
import { IssuesRegion } from "./issues-region";
import { Toolbar } from "./toolbar";
import { composeStatus, usePaneControl } from "./use-pane";
import { Pane } from "../pane/pane";

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

function useNoticeAndDocument(store: Store) {
  const notice = useStoreSlice(store, (s) => s.notice);
  const doc = useStoreSlice(store, (s) => s.document);
  return { notice, doc };
}

function useShellParts(services: AppServices | undefined) {
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
  return { svc, store, autosave };
}

/** Verify wiring (Requirement 17.1): one flow at a time; the flow reports through the Store. */
function useVerify(svc: AppServices, store: Store) {
  const [running, setRunning] = useState(false);
  const start = (): void => {
    setRunning(true);
    void runVerifyFlow(svc.api, store).then(() => {
      setRunning(false);
    });
  };
  return { running, start };
}

export function AppShell({ services }: AppShellProps) {
  const { svc, store, autosave } = useShellParts(services);
  const [cursor, setCursor] = useState(0);
  const binding = useEditorBinding({ store, now: svc.now, onCaret: setCursor });
  const paneControl = usePaneControl(svc);
  useAutosave(store, svc, autosave);
  const { notice, doc } = useNoticeAndDocument(store);
  const mode = useServerMode(svc.api);
  const verify = useVerify(svc, store);
  return (
    <div className="app" data-pane={paneControl.open ? "open" : undefined}>
      <Toolbar
        notice={notice}
        paneOpen={paneControl.open}
        verifyDisabled={verify.running || !hasFullRecord(doc)}
        verifyRunning={verify.running}
        exportDisabled={true}
        badge={mode === "loading" ? undefined : <ModeBadge mode={mode} />}
        onVerify={verify.start}
        onTogglePane={paneControl.toggle}
      />
      <EditorSurface editor={binding.editor} empty={doc.text.length === 0} />
      <IssuesRegion
        document={doc}
        store={store}
        now={svc.now}
        onGo={binding.focusAt}
        demoMode={mode === "fixtures"}
      />
      <Pane
        open={paneControl.open}
        document={doc}
        cursorOffset={cursor}
        statusOverride={composeStatus(doc, cursor, paneControl.saveMessage)}
        onItemClick={binding.focusAt}
        onBackgroundClick={binding.focusEnd}
      />
    </div>
  );
}
