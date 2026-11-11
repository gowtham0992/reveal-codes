import type { CallerOperation } from "@reveal-codes/engine";
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { useEditor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { Store } from "../store-runtime";
import { markRanges } from "./marks";
import { createMarksPlugin, MARKS_META } from "./marks-plugin";
import { docText, offsetToPos, posToOffset } from "./offsets";
import { createProvenancePlugin } from "./provenance-plugin";
import { reconcile } from "./reconcile";
import { EDITOR_EXTENSIONS } from "./schema";
import { requestCentre } from "./scroll-centre";
import { classifyKey } from "./shortcuts";

export type EditorBinding = Readonly<{
  editor: Editor | null;
  /** Move the selection to `offset` and focus the Editor (pane click, Go control). */
  focusAt(offset: number): void;
  focusEnd(): void;
}>;

export type EditorBindingArgs = Readonly<{
  store: Store;
  now: () => Date;
  /** Called with the head Offset after every transaction (Requirement 6.7). */
  onCaret: (offset: number) => void;
}>;

const PLACEHOLDER = "Paste or type your document here";

function headOffset(view: EditorView): number {
  return posToOffset(view.state.doc, view.state.selection.head) ?? 0;
}

/** Reconcile when the Editor text differs from the Store Document text. */
function syncToStore(view: EditorView, store: Store, caret: number | null): void {
  const text = store.getState().document.text;
  if (docText(view.state.doc) !== text) reconcile(view, text, caret ?? headOffset(view));
}

function historyKey(view: EditorView, store: Store, event: KeyboardEvent): boolean {
  const ctx = { paneOpen: false, modalOpen: false, editorFocused: true };
  const action = classifyKey(event, ctx);
  if (action !== "undo" && action !== "redo") return false;
  event.preventDefault();
  const result = store.dispatch({ type: action });
  syncToStore(view, store, result.caret);
  return true;
}

function flushEdit(view: EditorView, store: Store, ops: readonly CallerOperation[]): void {
  store.dispatch({ type: "edit", ops });
  // A rejected edit leaves the Document unchanged; any drift is reconciled.
  syncToStore(view, store, null);
}

function placeCaret(editor: Editor, offset: number): void {
  const pos = offsetToPos(editor.state.doc, offset);
  if (pos === null) return;
  const selection = TextSelection.create(editor.state.doc, pos);
  // ProseMirror ignores scrollIntoView on an unfocused view, so scrolling is requested
  // explicitly after focus, in the next frame, centring the line (Go, Pane clicks, focusEnd).
  editor.view.dispatch(editor.state.tr.setSelection(selection));
  editor.view.focus();
  requestCentre(editor.view);
}

export function useEditorBinding(args: EditorBindingArgs): EditorBinding {
  const { store, now } = args;
  const onCaretRef = useRef(args.onCaret);
  onCaretRef.current = args.onCaret;
  const nowRef = useRef(now);
  nowRef.current = now;
  const editor = useEditor({
    extensions: EDITOR_EXTENSIONS,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "Document",
        "aria-placeholder": PLACEHOLDER,
        // Party names and reporters are not words to a spell checker; the only red mark is ours.
        spellcheck: "false",
      },
      handleKeyDown: (view, event) => historyKey(view, store, event),
    },
  });
  useRegisteredPlugin(editor, store, nowRef);
  useReconcileEffect(editor, store);
  useMarks(editor, store);
  useSelectionReport(editor, onCaretRef);
  const focusAt = useCallback(
    (offset: number) => {
      if (editor !== null && !editor.isDestroyed) placeCaret(editor, offset);
    },
    [editor],
  );
  const focusEnd = useCallback(() => {
    if (editor !== null && !editor.isDestroyed)
      placeCaret(editor, docText(editor.state.doc).length);
  }, [editor]);
  return { editor, focusAt, focusEnd };
}

function useRegisteredPlugin(
  editor: Editor | null,
  store: Store,
  nowRef: { current: () => Date },
): void {
  useEffect(() => {
    if (editor === null || editor.isDestroyed) return undefined;
    const plugin = createProvenancePlugin({
      now: () => nowRef.current(),
      // Dispatching from inside the plugin view is deferred past the state update.
      onEdit: (ops) => {
        queueMicrotask(() => {
          if (!editor.isDestroyed) flushEdit(editor.view, store, ops);
        });
      },
    });
    editor.registerPlugin(plugin);
    return () => {
      if (!editor.isDestroyed) editor.unregisterPlugin(plugin.spec.key ?? "");
    };
  }, [editor, store, nowRef]);
}

/** Page marks: derive ranges from the Store and apply them when Editor and Store text agree (Req 11). */
function useMarks(editor: Editor | null, store: Store): void {
  useEffect(() => {
    if (editor === null || editor.isDestroyed) return undefined;
    const plugin = createMarksPlugin();
    editor.registerPlugin(plugin);
    let applied = "[]";
    const sync = (): void => {
      if (editor.isDestroyed) return;
      const { document, verifiedAt } = store.getState();
      if (docText(editor.state.doc) !== document.text || editor.view.composing) return;
      const ranges = verifiedAt === null ? [] : markRanges(document);
      const signature = JSON.stringify(ranges);
      if (signature === applied) return;
      applied = signature;
      editor.view.dispatch(editor.state.tr.setMeta(MARKS_META, ranges));
    };
    const onTransaction = (): void => {
      queueMicrotask(sync);
    };
    const unsubscribe = store.subscribe(sync);
    editor.on("transaction", onTransaction);
    sync();
    return () => {
      unsubscribe();
      editor.off("transaction", onTransaction);
      if (!editor.isDestroyed) editor.unregisterPlugin(plugin.spec.key ?? "");
    };
  }, [editor, store]);
}

function useReconcileEffect(editor: Editor | null, store: Store): void {
  const text = useSyncExternalStore(
    store.subscribe,
    () => store.getState().document.text,
    () => store.getState().document.text,
  );
  useEffect(() => {
    if (editor === null || editor.isDestroyed) return;
    if (docText(editor.state.doc) !== text) reconcile(editor.view, text, headOffset(editor.view));
  }, [editor, text]);
}

function useSelectionReport(
  editor: Editor | null,
  onCaretRef: { current: (offset: number) => void },
): void {
  useEffect(() => {
    if (editor === null || editor.isDestroyed) return undefined;
    const report = (): void => {
      onCaretRef.current(headOffset(editor.view));
    };
    editor.on("transaction", report);
    report();
    return () => {
      editor.off("transaction", report);
    };
  }, [editor, onCaretRef]);
}
