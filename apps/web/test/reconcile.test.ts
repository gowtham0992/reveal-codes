// @vitest-environment jsdom
import type { CallerOperation } from "@reveal-codes/engine";
import { EditorView } from "@tiptap/pm/view";
import { afterEach, describe, expect, it } from "vitest";
import { docText, posToOffset } from "../src/editor/offsets";
import { createProvenancePlugin } from "../src/editor/provenance-plugin";
import { reconcile } from "../src/editor/reconcile";
import "./support/dom-shims";
import { stateFromText, withSelection } from "./support/pm";

const now = () => new Date("2026-02-03T04:05:06.000Z");
let view: EditorView | null = null;
afterEach(() => {
  view?.destroy();
  view = null;
});

function mount(text: string, caret: number, seen: CallerOperation[][]): EditorView {
  const plugin = createProvenancePlugin({ now, onEdit: (ops) => seen.push([...ops]) });
  const base = withSelection(stateFromText(text), caret);
  const state = base.reconfigure({ plugins: [plugin] });
  view = new EditorView(document.createElement("div"), { state });
  return view;
}

const head = (v: EditorView): number | null => posToOffset(v.state.doc, v.state.selection.head);

describe("reconcile", () => {
  it("replaces the text, emits no operation and restores the caret", () => {
    const seen: CallerOperation[][] = [];
    const v = mount("one", 3, seen);
    reconcile(v, "alpha\nbeta", 7);
    expect(docText(v.state.doc)).toBe("alpha\nbeta");
    expect(head(v)).toBe(7);
    expect(seen).toEqual([]);
  });

  it("clamps the caret to the new text length", () => {
    const v = mount("long text here", 14, []);
    reconcile(v, "ab", 99);
    expect(docText(v.state.doc)).toBe("ab");
    expect(head(v)).toBe(2);
    reconcile(v, "abc", -5);
    expect(head(v)).toBe(0);
  });

  it("reconciles to empty text as one empty paragraph", () => {
    const v = mount("x\ny", 1, []);
    reconcile(v, "", 4);
    expect(docText(v.state.doc)).toBe("");
    expect(v.state.doc.childCount).toBe(1);
    expect(head(v)).toBe(0);
  });
});
