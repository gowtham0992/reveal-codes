"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Document } from "@reveal-codes/engine";
import { createAutosave } from "../autosave";
import type { Autosave } from "../autosave";
import { useEditorBinding } from "../editor/use-editor-binding";
import { AUTOSAVE_KEY, deserialise, readRaw } from "../persist";
import { defaultServices } from "../services";
import type { AppServices } from "../services";
import { createStore } from "../store-runtime";
import type { Store } from "../store-runtime";
import { EditorSurface } from "./editor-surface";
import { useAssistantSlot } from "./assistant-column";
import { modeText, useModeResult } from "./use-server-mode";
import type { ServerMode } from "./use-server-mode";
import { windowTitle } from "./use-document-title";
import { StatusLine } from "./status-line";
import { IssuesRegion } from "./issues-region";
import { ShellToolbar } from "./shell-toolbar";
import { useVerify } from "./use-verify";
import { useExport } from "./use-export";
import { useDocumentActions } from "./use-document-actions";
import { composeStatus, positionText, usePaneControl } from "./use-pane";
import { Pane } from "../pane/pane";

export type AppShellProps = Readonly<{ services?: AppServices }>;

/** Mount-time load (Requirement 9.3): a missing or corrupt value leaves the empty Document. */
function loadAutosave(services: AppServices, store: Store): void {
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
  const verifiedAt = useStoreSlice(store, (s) => s.verifiedAt);
  return { notice, doc, verifiedAt };
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

type FlowsArgs = Readonly<{
  svc: AppServices;
  store: Store;
  autosave: Autosave;
  doc: Document;
  notice: string | null;
  onGo: (offset: number) => void;
}>;

/** Export, New/Load and Verify wiring for the toolbar. */
function useShellFlows({ svc, store, autosave, doc, notice, onGo }: FlowsArgs) {
  const exportGate = useExport({ svc, store, autosave, doc, notice, onGo });
  const actions = useDocumentActions({ store, svc, autosave, doc });
  const verify = useVerify(svc, store);
  return { exportGate, actions, verify };
}

type IssuesSlotProps = Readonly<{
  doc: Document;
  store: Store;
  svc: AppServices;
  binding: ReturnType<typeof useEditorBinding>;
  mode: ServerMode;
  verifiedAt: string | null;
  verify: ReturnType<typeof useVerify>;
}>;

function IssuesSlot({ doc, store, svc, binding, mode, verifiedAt, verify }: IssuesSlotProps) {
  return (
    <IssuesRegion
      document={doc}
      store={store}
      now={svc.now}
      onGo={binding.focusAt}
      demoMode={mode === "fixtures"}
      verifiedAt={verifiedAt}
      note={verify.note}
      verify={verify}
    />
  );
}

function useShellState(services: AppServices | undefined) {
  const { svc, store, autosave } = useShellParts(services);
  const { cursor, onCaret, getCaret } = useCaretRef();
  const binding = useEditorBinding({ store, now: svc.now, onCaret });
  const paneControl = usePaneControl(svc);
  const { notice, doc, verifiedAt } = useNoticeAndDocument(store);
  const { mode, assistant } = useModeResult(svc.api);
  const slot = useAssistantSlot({ svc, store, info: assistant, getCaret });
  const onGo = binding.focusAt;
  const { exportGate, actions, verify } = useShellFlows({
    svc,
    store,
    autosave,
    doc,
    notice,
    onGo,
  });
  return {
    slot,
    binding,
    doc,
    exportGate,
    actions,
    issues: { doc, store, svc, binding, mode, verifiedAt, verify },
    bottom: { paneControl, doc, cursor, mode, binding },
    toolbar: { notice, doc, verify, exportGate, pane: paneControl, actions },
  };
}

export function AppShell({ services }: AppShellProps) {
  const s = useShellState(services);
  return (
    <div
      className="app"
      data-pane={s.bottom.paneControl.open ? "open" : undefined}
      data-assistant={s.slot.attr}
    >
      <title>{windowTitle(s.doc.text)}</title>
      <ShellToolbar {...s.toolbar} />
      {s.slot.node}
      <EditorSurface editor={s.binding.editor} empty={s.doc.text.length === 0} />
      <IssuesSlot {...s.issues} />
      {s.exportGate.dialog}
      {s.actions.dialog}
      <ShellBottom {...s.bottom} />
    </div>
  );
}
