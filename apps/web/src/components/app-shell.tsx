"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Document } from "@reveal-codes/engine";
import { ORDERS } from "@reveal-codes/export";
import type { OrderEntry } from "@reveal-codes/export";
import { createAutosave } from "../autosave";
import type { Autosave } from "../autosave";
import { createDraftGate } from "../draft-gate";
import type { DraftGate } from "../draft-gate";
import { useEditorBinding } from "../editor/use-editor-binding";
import { NARROW_WIDTH, SHELL_MIN_WIDTH, defaultServices } from "../services";
import { SmallScreenPage } from "./small-screen-page";
import type { AppServices } from "../services";
import { createOrderSelectionStore } from "../order-selection";
import type { OrderSelectionStore } from "../order-selection";
import { createStore } from "../store-runtime";
import type { Store } from "../store-runtime";
import { EditorSurface } from "./editor-surface";
import { useAssistantSlot } from "./assistant-column";
import { modeText, useModeResult } from "./use-server-mode";
import type { ServerMode } from "./use-server-mode";
import { windowTitle } from "./use-document-title";
import { StatusLine } from "./status-line";
import { IssuesRegion } from "./issues-region";
import type { DraftNotice } from "./issues-region";
import { ShellToolbar } from "./shell-toolbar";
import { useVerify } from "./use-verify";
import { useAutosave } from "./use-autosave";
import { useHandover } from "./use-handover";
import { useExport } from "./use-export";
import { orderNoticeText, useOrderParameter } from "./use-order-parameter";
import { useDocumentActions } from "./use-document-actions";
import { composeStatus, positionText, usePaneControl } from "./use-pane";
import { lnPos } from "../pane/layout";
import { Pane } from "../pane/pane";
import { NO_LINKS } from "../public-links";
import type { PublicLinks } from "../public-links";

export type AppShellProps = Readonly<{ services?: AppServices; links?: PublicLinks }>;

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

function useShellParts(svc: AppServices) {
  const [store] = useState(() => createStore(svc.now));
  const [gate] = useState(() => createDraftGate());
  const [autosave] = useState(() =>
    createAutosave({
      gate,
      storage: svc.storage,
      setTimer: svc.setTimer,
      clearTimer: svc.clearTimer,
      onError: (text) => {
        store.dispatch({ type: "notice", text });
      },
    }),
  );
  useAutosave(store, svc, autosave, gate);
  const handoverDialog = useHandover(store, svc);
  return { svc, store, autosave, gate, handoverDialog };
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
  gate: DraftGate;
  doc: Document;
  notice: string | null;
  orderStore: OrderSelectionStore;
  onGo: (offset: number) => void;
}>;

/** Export, New/Load and Verify wiring for the toolbar. */
function useShellFlows(a: FlowsArgs) {
  const { svc, store, autosave, gate, doc } = a;
  const exportGate = useExport(a);
  const actions = useDocumentActions({ store, svc, autosave, gate, doc });
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
  draft: DraftNotice;
}>;

function IssuesSlot({
  doc,
  store,
  svc,
  binding,
  mode,
  verifiedAt,
  verify,
  draft,
}: IssuesSlotProps) {
  return (
    <IssuesRegion
      document={doc}
      store={store}
      now={svc.now}
      onGo={binding.focusAt}
      demoMode={mode === "fixtures"}
      verifiedAt={verifiedAt}
      note={verify.note}
      failure={verify.failure}
      verify={verify}
      resolved={verify.resolved}
      draft={draft}
    />
  );
}

type ShellProps = Readonly<{
  svc: AppServices;
  orderStore: OrderSelectionStore;
  /** Set once when this load applied an Order_Parameter while the Shell could be shown. */
  pendingNotice: string | null;
  onNoticeShown: () => void;
}>;

/** Dispatches the Toolbar_Notice for an applied Order_Parameter, once. */
function usePendingNotice(store: Store, text: string | null, shown: () => void): void {
  useEffect(() => {
    if (text === null) return;
    store.dispatch({ type: "notice", text });
    shown();
  }, [store, text, shown]);
}

function useShellState({ svc, orderStore, pendingNotice, onNoticeShown }: ShellProps) {
  const { store, autosave, gate, handoverDialog } = useShellParts(svc);
  usePendingNotice(store, pendingNotice, onNoticeShown);
  const blocked = useSyncExternalStore(gate.subscribe, gate.blocked, () => false);
  const { cursor, onCaret, getCaret } = useCaretRef();
  const binding = useEditorBinding({ store, now: svc.now, onCaret });
  const paneControl = usePaneControl(svc);
  const { notice, doc, verifiedAt } = useNoticeAndDocument(store);
  const { mode, assistant } = useModeResult(svc.api);
  const position = lnPos(doc.text, cursor);
  const slot = useAssistantSlot({ svc, store, info: assistant, getCaret, position });
  const onGo = binding.focusAt;
  const { exportGate, actions, verify } = useShellFlows({
    svc,
    store,
    autosave,
    gate,
    doc,
    notice,
    orderStore,
    onGo,
  });
  const draft: DraftNotice = {
    blocked,
    onSaveCopy: actions.onSaveDraftCopy,
    onStartNew: actions.onStartNewDraft,
  };
  return {
    handoverDialog,
    slot,
    binding,
    doc,
    exportGate,
    actions,
    issues: { doc, store, svc, binding, mode, verifiedAt, verify, draft },
    bottom: { paneControl, doc, cursor, mode, binding },
    toolbar: { notice, doc, verifiedAt, verify, exportGate, pane: paneControl, actions },
  };
}

/** Mounted fresh when the width reaches NARROW_WIDTH; unmounted (and flushed) below it. */
function Shell(props: ShellProps) {
  const s = useShellState(props);
  return (
    <div
      className="app"
      data-pane={s.bottom.paneControl.open ? "open" : undefined}
      data-assistant={s.slot.attr}
    >
      <title>{windowTitle(s.doc.text)}</title>
      <ShellToolbar {...s.toolbar} />
      {s.slot.node}
      <EditorSurface
        editor={s.binding.editor}
        empty={s.doc.text.length === 0}
        onLoadSample={s.actions.onLoadSample}
        onOpenDraft={s.actions.onOpen}
        openInput={s.actions.openInput}
      />
      <IssuesSlot {...s.issues} />
      {s.exportGate.dialog}
      {s.actions.dialog}
      {s.handoverDialog}
      <ShellBottom {...s.bottom} />
    </div>
  );
}

type Applied = Readonly<{ entry: OrderEntry; notice: string | null }>;

/** The shared selection store, and what this load's Order_Parameter applied. */
function useAppliedOrder(svc: AppServices) {
  const orderStore = useMemo(() => createOrderSelectionStore(svc.storage, ORDERS), [svc.storage]);
  const [applied, setApplied] = useState<Applied | null>(null);
  useOrderParameter(svc, orderStore, ORDERS, (entry, notify) => {
    setApplied({ entry, notice: notify ? orderNoticeText(entry) : null });
  });
  const onNoticeShown = (): void => {
    setApplied((a) => (a === null ? a : { ...a, notice: null }));
  };
  return { orderStore, applied, onNoticeShown };
}

/** The thin root: the Small_Screen_Page below NARROW_WIDTH, the Shell otherwise. */
export function AppShell({ services, links = NO_LINKS }: AppShellProps) {
  const [svc] = useState<AppServices>(() => services ?? defaultServices());
  const { orderStore, applied, onNoticeShown } = useAppliedOrder(svc);
  const width = useSyncExternalStore(
    svc.viewport.subscribe,
    svc.viewport.width,
    () => SHELL_MIN_WIDTH,
  );
  if (width < NARROW_WIDTH) {
    return <SmallScreenPage links={links} selection={applied === null ? null : applied.entry} />;
  }
  return (
    <Shell
      svc={svc}
      orderStore={orderStore}
      pendingNotice={applied === null ? null : applied.notice}
      onNoticeShown={onNoticeShown}
    />
  );
}
