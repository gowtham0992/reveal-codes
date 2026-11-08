// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Text } from "@tiptap/extension-text";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { afterEach, describe, expect, it } from "vitest";

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

describe("API notes 9 and 4/5 hooks (jsdom)", () => {
  it("mounts, registers a plugin, and exposes handlePaste/handleDrop props", () => {
    editor = mount();
    expect(editor.getText()).toBe("abc");
    const seen: string[] = [];
    const plugin = new Plugin({
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
    editor.registerPlugin(plugin);
    expect(editor.state.plugins).toContain(plugin);

    const view = editor.view;
    const pasteProp = plugin.props.handlePaste;
    const dropProp = plugin.props.handleDrop;
    expect(
      pasteProp?.call(
        plugin,
        view,
        new Event("paste") as ClipboardEvent,
        view.state.doc.slice(0, 0),
      ),
    ).toBe(true);
    expect(
      dropProp?.call(
        plugin,
        view,
        new Event("drop") as DragEvent,
        view.state.doc.slice(0, 0),
        false,
      ),
    ).toBe(true);
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
