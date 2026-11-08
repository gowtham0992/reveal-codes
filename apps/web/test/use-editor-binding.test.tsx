// @vitest-environment jsdom
import { EditorContent } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import { describe, expect, it, vi } from "vitest";
import { docText, offsetToPos, posToOffset } from "../src/editor/offsets";
import { useEditorBinding } from "../src/editor/use-editor-binding";
import type { EditorBinding } from "../src/editor/use-editor-binding";
import { createStore } from "../src/store-runtime";
import type { Store } from "../src/store-runtime";
import { createManualClock } from "./support/clock";
import { act, renderUi } from "./support/render";

type Harness = { store: Store; binding: () => EditorBinding; carets: number[] };

function Probe(props: {
  store: Store;
  now: () => Date;
  carets: number[];
  out: { binding: EditorBinding | null };
}) {
  const binding = useEditorBinding({
    store: props.store,
    now: props.now,
    onCaret: (o) => props.carets.push(o),
  });
  props.out.binding = binding;
  return <EditorContent editor={binding.editor} />;
}

async function mount(): Promise<Harness & { clock: ReturnType<typeof createManualClock> }> {
  const clock = createManualClock();
  const store = createStore(clock.now);
  const carets: number[] = [];
  const out: { binding: EditorBinding | null } = { binding: null };
  await act(async () => {
    renderUi(<Probe store={store} now={clock.now} carets={carets} out={out} />);
    await Promise.resolve();
  });
  const binding = (): EditorBinding => {
    if (out.binding === null) throw new Error("binding missing");
    return out.binding;
  };
  expect(binding().editor).not.toBeNull();
  return { store, binding, carets, clock };
}

const flush = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

function view(h: Harness) {
  const editor = h.binding().editor;
  if (editor === null) throw new Error("no editor");
  return editor.view;
}

function externalInsert(h: Harness, at: number, text: string): void {
  act(() => {
    h.store.dispatch({
      type: "edit",
      ops: [
        {
          kind: "insert",
          at,
          text,
          provenance: { origin: "PST", timestamp: "2026-01-01T00:00:00.000Z" },
        },
      ],
    });
  });
}

describe("useEditorBinding", () => {
  it("sets the textbox attributes", async () => {
    const h = await mount();
    const dom = view(h).dom;
    expect(dom.getAttribute("role")).toBe("textbox");
    expect(dom.getAttribute("aria-multiline")).toBe("true");
    expect(dom.getAttribute("aria-label")).toBe("Document");
    expect(dom.getAttribute("aria-placeholder")).not.toBeNull();
  });

  it("reconciles a Store change from outside the Editor", async () => {
    const h = await mount();
    externalInsert(h, 0, "hello\nworld");
    expect(docText(view(h).state.doc)).toBe("hello\nworld");
    expect(h.store.getState().undo.length).toBe(1);
  });

  it("records typing as HUM in the Store Document", async () => {
    const h = await mount();
    const v = view(h);
    act(() => {
      v.dispatch(v.state.tr.insertText("hi", 1));
    });
    await flush();
    expect(h.store.getState().document.text).toBe("hi");
    expect(h.store.getState().document.spans.map((s) => s.provenance.origin)).toEqual(["HUM"]);
  });

  it("reconciles a rejected edit to the unchanged text and shows a Notice", async () => {
    const h = await mount();
    externalInsert(h, 0, "a\u{1F600}b");
    const v = view(h);
    act(() => {
      v.dispatch(v.state.tr.delete(3, 4)); // second half of the surrogate pair
    });
    await flush();
    expect(h.store.getState().document.text).toBe("a\u{1F600}b");
    expect(docText(view(h).state.doc)).toBe("a\u{1F600}b");
    expect(h.store.getState().notice).toMatch(/^Edit not applied/);
  });

  it("Cmd-Z restores the text and places the caret from the undo result", async () => {
    const h = await mount();
    externalInsert(h, 0, "hello");
    h.clock.advance(5000);
    const v = view(h);
    act(() => {
      v.dispatch(v.state.tr.delete(5, 6));
    });
    await flush();
    expect(h.store.getState().document.text).toBe("hell");
    act(() => {
      v.dom.dispatchEvent(
        new KeyboardEvent("keydown", { key: "z", metaKey: true, bubbles: true, cancelable: true }),
      );
    });
    expect(h.store.getState().document.text).toBe("hello");
    expect(docText(view(h).state.doc)).toBe("hello");
    expect(posToOffset(view(h).state.doc, view(h).state.selection.head)).toBe(5);
  });

  it("Cmd-Shift-Z redoes", async () => {
    const h = await mount();
    externalInsert(h, 0, "ab");
    const v = view(h);
    const press = (shiftKey: boolean) => {
      act(() => {
        v.dom.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "z",
            ctrlKey: true,
            shiftKey,
            bubbles: true,
            cancelable: true,
          }),
        );
      });
    };
    press(false);
    expect(docText(view(h).state.doc)).toBe("");
    press(true);
    expect(docText(view(h).state.doc)).toBe("ab");
  });

  it("reports the head Offset of the selection", async () => {
    const h = await mount();
    externalInsert(h, 0, "abc\ndef");
    const v = view(h);
    const pos = offsetToPos(v.state.doc, 5);
    expect(pos).not.toBeNull();
    act(() => {
      v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, pos ?? 1)));
    });
    expect(h.carets[h.carets.length - 1]).toBe(5);
  });

  it("focusAt and focusEnd request one centring scroll each, after the editor is focused", async () => {
    const h = await mount();
    externalInsert(h, 0, Array.from({ length: 200 }, (_, i) => `line ${String(i)}`).join("\n"));
    const v = view(h);
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => undefined);
    const focusedAtRequest: boolean[] = [];
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => {
      focusedAtRequest.push(v.hasFocus());
      frames.push(cb);
      return frames.length;
    });
    const dispatched: boolean[] = [];
    const original = v.dispatch.bind(v);
    v.dispatch = (tr) => {
      dispatched.push(tr.scrolledIntoView);
      original(tr);
    };
    act(() => {
      h.binding().focusAt(1000); // Go and Pane clicks share this path
    });
    expect(focusedAtRequest).toEqual([true]);
    expect(dispatched.every((s) => !s)).toBe(true);
    act(() => {
      h.binding().focusEnd();
    });
    expect(focusedAtRequest).toEqual([true, true]);
    act(() => {
      for (const f of frames) f(0); // no layout in jsdom: must not throw
    });
    expect(posToOffset(v.state.doc, v.state.selection.head)).toBe(docText(v.state.doc).length);
    vi.restoreAllMocks();
  });

  it("focusEnd moves the caret to the end of the text", async () => {
    const h = await mount();
    externalInsert(h, 0, "abc\ndef");
    act(() => {
      h.binding().focusEnd();
    });
    expect(h.carets[h.carets.length - 1]).toBe(7);
  });
});
