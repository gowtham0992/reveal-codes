import type { CallerOperation, Provenance } from "@reveal-codes/engine";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { buildDropTransaction, buildPasteTransaction, plainTextOf } from "./clipboard";
import { PROVENANCE_META, RECONCILE_META } from "./meta";
import { docText } from "./offsets";
import { transactionToOps } from "./transaction-ops";

export { PROVENANCE_META, RECONCILE_META };

export type ProvenancePluginOptions = Readonly<{
  now: () => Date;
  /** Called once per plugin state that carries operations. */
  onEdit: (ops: readonly CallerOperation[]) => void;
}>;

type PluginState = Readonly<{ ops: readonly CallerOperation[] }> | null;

const provenanceKey = new PluginKey<PluginState>("revealCodesProvenance");

/**
 * The provenance of a transaction: null for Reconcile and for transactions that
 * do not change the document. Meta wins; paste or drop without meta is PST;
 * everything else (typing, IME, Enter, Backspace, Delete, cut) is HUM.
 * Assistant text (AI) enters through the Store, never from here.
 */
export function provenanceFor(tr: Transaction, now: () => Date): Provenance | null {
  if (tr.getMeta(RECONCILE_META) === true || !tr.docChanged) return null;
  const timestamp = now().toISOString();
  const meta: unknown = tr.getMeta(PROVENANCE_META);
  if (typeof meta === "object" && meta !== null && "origin" in meta && meta.origin === "PST")
    return { origin: "PST", timestamp };
  const ui: unknown = tr.getMeta("uiEvent");
  if (ui === "paste" || ui === "drop") return { origin: "PST", timestamp };
  return { origin: "HUM", timestamp };
}

function nextState(tr: Transaction, before: string, now: () => Date): PluginState {
  const provenance = provenanceFor(tr, now);
  if (provenance === null) return null;
  const ops = transactionToOps(before, tr.steps, provenance);
  return ops.length === 0 ? null : { ops };
}

function onPaste(view: EditorView, event: ClipboardEvent): boolean {
  event.preventDefault();
  const text = plainTextOf(event.clipboardData);
  if (text !== null) view.dispatch(buildPasteTransaction(view.state, text));
  return true;
}

function onDrop(view: EditorView, event: DragEvent, moved: boolean): boolean {
  event.preventDefault();
  const text = plainTextOf(event.dataTransfer);
  const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
  if (text !== null && at !== null)
    view.dispatch(buildDropTransaction(view.state, text, at.pos, moved));
  return true;
}

function onBeforeInput(event: Event): boolean {
  const type = (event as InputEvent).inputType;
  if (type !== "historyUndo" && type !== "historyRedo") return false;
  event.preventDefault();
  return true;
}

export function createProvenancePlugin(options: ProvenancePluginOptions): Plugin {
  return new Plugin<PluginState>({
    key: provenanceKey,
    state: {
      init: () => null,
      apply: (tr, _value, oldState) => nextState(tr, docText(oldState.doc), options.now),
    },
    view: () => {
      let last: PluginState = null;
      return {
        update(view) {
          const state = provenanceKey.getState(view.state) ?? null;
          if (state === last) return;
          last = state;
          if (state !== null) options.onEdit(state.ops);
        },
      };
    },
    props: {
      handlePaste: (view, event) => onPaste(view, event),
      handleDrop: (view, event, _slice, moved) => onDrop(view, event, moved),
      handleDOMEvents: { beforeinput: (_view, event) => onBeforeInput(event) },
    },
  });
}
