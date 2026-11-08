import { TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { RECONCILE_META } from "./meta";
import { docFromText, docText, offsetToPos } from "./offsets";

/**
 * Replace the whole content with the Paragraph_List of `text`. The transaction
 * carries RECONCILE_META, so the provenance plugin emits no operation. The
 * selection head is restored at `caretOffset`, clamped to the new text length.
 */
export function reconcile(view: EditorView, text: string, caretOffset: number): void {
  const { state } = view;
  const next = docFromText(state.schema, text);
  const tr = state.tr.replaceWith(0, state.doc.content.size, next.content);
  tr.setMeta(RECONCILE_META, true);
  tr.setMeta("addToHistory", false);
  const wanted = Number.isInteger(caretOffset) ? caretOffset : 0;
  const clamped = Math.max(0, Math.min(wanted, docText(next).length));
  const pos = offsetToPos(tr.doc, clamped);
  if (pos !== null) tr.setSelection(TextSelection.create(tr.doc, pos));
  view.dispatch(tr);
}
