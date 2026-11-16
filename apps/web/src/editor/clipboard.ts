import { docxSafe } from "@reveal-codes/export";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { PROVENANCE_META } from "./meta";
import { editorSchema } from "./schema";
import { textToSlice } from "./slice-text";

/** Replace `\r\n` and lone `\r` with `\n`. */
export function normaliseNewlines(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

/**
 * The `text/plain` data with Docx_Safe_Text (Req 22.3, which also normalises newlines), or null when there is none.
 * Other formats (HTML, files) are never read.
 */
export function plainTextOf(data: Pick<DataTransfer, "getData"> | null | undefined): string | null {
  if (data === null || data === undefined) return null;
  const text = data.getData("text/plain");
  if (text === "") return null;
  const safe = docxSafe(text).text;
  return safe === "" ? null : safe;
}

/** Replace [from, to) with `text` as a paste: PST meta and uiEvent "paste". */
export function pasteInto(tr: Transaction, text: string, from: number, to: number): void {
  tr.replaceRange(from, to, textToSlice(editorSchema, text));
  tr.setMeta("uiEvent", "paste");
  tr.setMeta(PROVENANCE_META, { origin: "PST" });
}

/** Paste `text` over the current selection in one transaction. */
export function buildPasteTransaction(state: EditorState, text: string): Transaction {
  const { from, to } = state.selection;
  const tr = state.tr;
  pasteInto(tr, text, from, to);
  return tr;
}

/**
 * Drop `text` at `pos`. For a drag-move the dragged selection is deleted first
 * and the drop position is mapped through that deletion, so moved text is PST (L6).
 */
export function buildDropTransaction(
  state: EditorState,
  text: string,
  pos: number,
  moved: boolean,
): Transaction {
  const tr = state.tr;
  if (moved && !state.selection.empty) tr.deleteSelection();
  const at = tr.mapping.map(pos);
  pasteInto(tr, text, at, at);
  tr.setMeta("uiEvent", "drop");
  return tr;
}
