"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Document } from "@reveal-codes/engine";
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
import { useAssistantSlot } from "./assistant-column";
import { modeText, useModeResult } from "./use-server-mode";
import type { ServerMode } from "./use-server-mode";
import { StatusLine } from "./status-line";
import { IssuesRegion } from "./issues-region";
import { Toolbar } from "./toolbar";
import { useExport } from "./use-export";
import { useDocumentActions } from "./use-document-actions";
import { composeStatus, positionText, usePaneControl } from "./use-pane";
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
      verifiedAt: restored.value.verifiedAt,
    });
  }
}

/** Schedules a save whenever the Document, Run_Log or verifiedAt changes; flushes when the page is hidden. */
function useAutosave(store: Store, services: AppServices, autosave: Autosave): void {
  useEffect(() => {
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
  useAutosave(store, svc, autosave);
  return { svc, store, autosave };
}

/** Verify wiring (Requirement 17.1): one flow at a time; the flow reports through the Store. */
function useVerify(svc: AppServices, store: Store) {
  const [running, setRunning] = useState(false);
  const start = (): void => {
    setRunning(true);
    void runVerifyFlow(svc.api, store, svc.now).then(() => {
      setRunning(false);
    });
  };
  return { running, start };
}

type ShellToolbarProps = Readonly<{
  notice: string | null;
  doc: Document;
  svc: AppServices;
  store: Store;
  exportGate: ReturnType<typeof useExport>;
  pane: ReturnType<typeof usePaneControl>;
  actions: ReturnType<typeof useDocumentActions>;
}>;

function ShellToolbar(props: ShellToolbarProps) {
  const { notice, doc, exportGate, pane, actions } = props;
  const verify = useVerify(props.svc, props.store);
  return (
    <Toolbar
      notice={notice}
      onNew={actions.onNew}
      onLoadDemo={actions.onLoadDemo}
      paneOpen={pane.open}
      verifyDisabled={verify.running || !hasFullRecord(doc)}
      verifyRunning={verify.running}
      {...exportGate.toolbar}
      onVerify={verify.start}
      onTogglePane={pane.toggle}
    />
  );
}

/** The caret Offset as a ref, so a draft that ends later inserts where the caret is then. */
function useCaretRef() {
  const caret = useRef(0);
  const [cursor, setCursor] = useState(0);
  const onCaret = (offset: number): void => {
    caret.current = offset;
    setCursor(offset);
  };
  return { cursor, onCaret, getCaret: () => caret.current };
}

type ShellBottomProps = Readonly<{
  paneControl: ReturnType<typeof usePaneControl>;
  doc: Document;
  cursor: number;
  mode: ServerMode;
  binding: ReturnType<typeof useEditorBinding>;
}>;

/** The Pane while open; the Status_Line while closed. */
function ShellBottom({ paneControl, doc, cursor, mode, binding }: ShellBottomProps) {
  return (
    <>
      <Pane
        open={paneControl.open}
        document={doc}
        cursorOffset={cursor}
        statusOverride={composeStatus(doc, cursor, paneControl.saveMessage)}
        modeText={modeText(mode)}
        onItemClick={binding.focusAt}
        onBackgroundClick={binding.focusEnd}
      />
      {paneControl.open ? null : (
        <StatusLine position={positionText(doc, cursor)} mode={modeText(mode)} />
      )}
    </>
  );
}

export function AppShell({ services }: AppShellProps) {
  const { svc, store, autosave } = useShellParts(services);
  const { cursor, onCaret, getCaret } = useCaretRef();
  const binding = useEditorBinding({ store, now: svc.now, onCaret });
  const paneControl = usePaneControl(svc);
  const { notice, doc } = useNoticeAndDocument(store);
  const { mode, assistant } = useModeResult(svc.api);
  const slot = useAssistantSlot({ svc, store, info: assistant, getCaret });
  const exportGate = useExport({ svc, store, autosave, doc, notice, onGo: binding.focusAt });
  const actions = useDocumentActions({ store, svc, autosave, doc });
  const toolbar = { notice, doc, svc, store, exportGate, pane: paneControl, actions };
  return (
    <div
      className="app"
      data-pane={paneControl.open ? "open" : undefined}
      data-assistant={slot.attr}
    >
      <ShellToolbar {...toolbar} />
      {slot.node}
      <EditorSurface editor={binding.editor} empty={doc.text.length === 0} />
      <IssuesRegion
        document={doc}
        store={store}
        now={svc.now}
        onGo={binding.focusAt}
        demoMode={mode === "fixtures"}
      />
      {exportGate.dialog}
      {actions.dialog}
      <ShellBottom
        paneControl={paneControl}
        doc={doc}
        cursor={cursor}
        mode={mode}
        binding={binding}
      />
    </div>
  );
}
