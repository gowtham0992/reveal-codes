import { EditorState, TextSelection } from "@tiptap/pm/state";
import type { Transaction } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import { docFromText, docText, offsetToPos } from "../../src/editor/offsets";
import { editorSchema } from "../../src/editor/schema";
import { textToSlice } from "../../src/editor/slice-text";

/** Pos of `index` code units into paragraph `paragraph`, computed from node sizes. */
export function posIn(doc: PMNode, paragraph: number, index: number): number {
  let pos = 1;
  for (let i = 0; i < paragraph; i++) pos += doc.child(i).content.size + 2;
  return pos + index;
}

export function stateFromText(text: string): EditorState {
  return EditorState.create({ doc: docFromText(editorSchema, text), schema: editorSchema });
}

/** Step descriptors; numbers are reduced modulo the evolving document. */
export type StepDescriptor =
  | Readonly<{ kind: "insert"; at: number; text: string }>
  | Readonly<{ kind: "delete"; from: number; to: number }>
  | Readonly<{ kind: "replace"; from: number; to: number; text: string }>
  | Readonly<{ kind: "split"; at: number }>
  | Readonly<{ kind: "join"; which: number }>
  | Readonly<{ kind: "paste"; from: number; to: number; text: string }>;

const isHigh = (c: number): boolean => c >= 0xd800 && c <= 0xdbff;
const isLow = (c: number): boolean => c >= 0xdc00 && c <= 0xdfff;

/** Reduce `n` into 0..text.length and move it off a surrogate pair interior. */
function snap(text: string, n: number): number {
  const o = ((n % (text.length + 1)) + (text.length + 1)) % (text.length + 1);
  const inside =
    o > 0 && o < text.length && isHigh(text.charCodeAt(o - 1)) && isLow(text.charCodeAt(o));
  return inside ? o - 1 : o;
}

function posOf(tr: Transaction, offset: number): number {
  const pos = offsetToPos(tr.doc, offset);
  if (pos === null) throw new Error(`offset ${String(offset)} outside the document`);
  return pos;
}

function range(tr: Transaction, a: number, b: number): readonly [number, number] {
  const text = docText(tr.doc);
  const x = snap(text, a);
  const y = snap(text, b);
  return [Math.min(x, y), Math.max(x, y)];
}

/** Apply a paste of `text` over the selection, as the paste handler does. */
export function pasteInto(tr: Transaction, text: string, from: number, to: number): void {
  tr.replaceRange(from, to, textToSlice(editorSchema, text));
  tr.setMeta("uiEvent", "paste");
}

function applyDescriptor(tr: Transaction, d: StepDescriptor): void {
  const text = docText(tr.doc);
  if (d.kind === "split") {
    tr.split(posOf(tr, snap(text, d.at)));
  } else if (d.kind === "join") {
    const breaks: number[] = [];
    for (let i = 0; i < text.length; i++) if (text[i] === "\n") breaks.push(i);
    if (breaks.length === 0) return;
    const offset = breaks[Math.abs(d.which) % breaks.length] ?? 0;
    tr.join(posOf(tr, offset) + 1);
  } else {
    const [from, to] = d.kind === "insert" ? range(tr, d.at, d.at) : range(tr, d.from, d.to);
    const a = posOf(tr, from);
    const b = posOf(tr, to);
    if (d.kind === "delete") tr.delete(a, b);
    else if (d.kind === "paste") pasteInto(tr, d.text, a, b);
    else if (d.text === "") tr.delete(a, b);
    else tr.insertText(d.text, a, b);
  }
}

/**
 * Build one transaction from descriptors. Descriptors that cannot apply (join
 * without a paragraph boundary) are skipped.
 */
export function buildTransaction(
  state: EditorState,
  descriptors: readonly StepDescriptor[],
): Transaction {
  const tr = state.tr;
  for (const d of descriptors) applyDescriptor(tr, d);
  return tr;
}

/** Paste `text` over the current selection. Shared with the paste handler (task 4.1). */
export function buildPasteTransaction(state: EditorState, text: string): Transaction {
  const { from, to } = state.selection;
  const tr = state.tr;
  pasteInto(tr, text, from, to);
  return tr;
}

export function withSelection(state: EditorState, from: number, to: number = from): EditorState {
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)));
}
