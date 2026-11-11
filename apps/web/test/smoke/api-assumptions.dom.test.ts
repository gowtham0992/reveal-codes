// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Text } from "@tiptap/extension-text";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { CallerOperation } from "@reveal-codes/engine";
import { afterEach, describe, expect, it } from "vitest";
import { docText } from "../../src/editor/offsets";
import { createProvenancePlugin, provenanceFor } from "../../src/editor/provenance-plugin";

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

function mount(): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: [Document, Paragraph, Text],
    content: "<p>abc</p>",
  });
}

function hookPlugin(seen: string[]): Plugin {
  return new Plugin({
    key: new PluginKey("smoke"),
    props: {
      handlePaste: (view: EditorView, event: ClipboardEvent, slice) => {
        seen.push(`paste:${typeof view.dispatch}:${event.type}:${String(slice.size)}`);
        return true;
      },
      handleDrop: (view: EditorView, event: DragEvent, slice, moved) => {
        seen.push(
          `drop:${typeof view.dispatch}:${event.type}:${String(slice.size)}:${String(moved)}`,
        );
        return true;
      },
    },
  });
}

describe("API notes 9 and 4/5 hooks (jsdom)", () => {
  it("mounts, registers a plugin, and exposes handlePaste/handleDrop props", () => {
    editor = mount();
    expect(editor.getText()).toBe("abc");
    const seen: string[] = [];
    const plugin = hookPlugin(seen);
    editor.registerPlugin(plugin);
    expect(editor.state.plugins).toContain(plugin);

    const view = editor.view;
    const slice = view.state.doc.slice(0, 0);
    const paste = plugin.props.handlePaste;
    const drop = plugin.props.handleDrop;
    expect(paste?.call(plugin, view, new Event("paste") as ClipboardEvent, slice)).toBe(true);
    expect(drop?.call(plugin, view, new Event("drop") as DragEvent, slice, false)).toBe(true);
    expect(seen).toEqual(["paste:function:paste:0", "drop:function:drop:0:false"]);
  });

  it("registerPlugin plugin sees transactions; built-ins add no document-changing appendTransaction", () => {
    editor = mount();
    let count = 0;
    editor.registerPlugin(
      new Plugin({
        key: new PluginKey("count"),
        state: {
          init: () => 0,
          apply: (tr, value: number) => {
            if (tr.docChanged) count += 1;
            return value;
          },
        },
      }),
    );
    editor.view.dispatch(editor.state.tr.insertText("X", 2));
    expect(count).toBe(1);
    expect(editor.getText()).toBe("aXbc");
  });
});

describe("page marks assumptions (Requirements 11.3, 11.7)", () => {
  const MARKS = new PluginKey<DecorationSet>("smokeMarks");

  function mountTwoParagraphs(): Editor {
    const element = document.createElement("div");
    document.body.appendChild(element);
    return new Editor({
      element,
      extensions: [Document, Paragraph, Text],
      content: "<p>abc</p><p>def</p>",
    });
  }

  function marksPlugin(): Plugin<DecorationSet> {
    return new Plugin<DecorationSet>({
      key: MARKS,
      state: {
        init: () => DecorationSet.empty,
        apply: (tr, set) => {
          const meta: unknown = tr.getMeta(MARKS);
          if (meta instanceof DecorationSet) return meta;
          return set.map(tr.mapping, tr.doc);
        },
      },
      props: { decorations: (state) => MARKS.getState(state) },
    });
  }

  // Doc: <p>abc</p><p>def</p>; Pos 2 is inside "abc", Pos 8 is inside "def".
  function setMarks(e: Editor, from: number, to: number): void {
    const set = DecorationSet.create(e.state.doc, [
      Decoration.inline(from, to, { class: "mark", title: "Citation not found" }),
    ]);
    e.view.dispatch(e.state.tr.setMeta(MARKS, set));
  }

  it("a meta-only transaction leaves docText unchanged", () => {
    editor = mountTwoParagraphs();
    editor.registerPlugin(marksPlugin());
    const before = docText(editor.state.doc);
    setMarks(editor, 2, 8);
    expect(before).toBe("abc\ndef");
    expect(docText(editor.state.doc)).toBe(before);
  });

  it("a meta-only transaction produces no Provenance_Plugin operation", () => {
    editor = mountTwoParagraphs();
    const batches: (readonly CallerOperation[])[] = [];
    editor.registerPlugin(
      createProvenancePlugin({ now: () => new Date(0), onEdit: (ops) => batches.push(ops) }),
    );
    editor.registerPlugin(marksPlugin());
    const tr = editor.state.tr.setMeta(MARKS, DecorationSet.empty);
    expect(tr.docChanged).toBe(false);
    expect(provenanceFor(tr, () => new Date(0))).toBeNull();
    setMarks(editor, 2, 8);
    expect(batches).toEqual([]);

    // Control: a real edit does reach the plugin, so the empty list above is meaningful.
    editor.view.dispatch(editor.state.tr.insertText("X", 2));
    expect(batches).toHaveLength(1);
    expect(batches[0]).toEqual([expect.objectContaining({ kind: "insert", at: 1, text: "X" })]);
  });

  it("Decoration.inline spanning a paragraph boundary renders in both paragraphs", () => {
    editor = mountTwoParagraphs();
    editor.registerPlugin(marksPlugin());
    setMarks(editor, 2, 8);
    const marked = Array.from(editor.view.dom.querySelectorAll<HTMLElement>("span.mark"));
    expect(marked.map((m) => m.textContent)).toEqual(["bc", "de"]);
    expect(marked.every((m) => m.getAttribute("title") === "Citation not found")).toBe(true);
    const paragraphs = editor.view.dom.querySelectorAll("p");
    expect(paragraphs[0]?.querySelector("span.mark")?.textContent).toBe("bc");
    expect(paragraphs[1]?.querySelector("span.mark")?.textContent).toBe("de");
  });
});
