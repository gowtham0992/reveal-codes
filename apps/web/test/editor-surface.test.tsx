// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { useSyncExternalStore } from "react";
import { EditorSurface, EDITOR_PLACEHOLDER } from "../src/components/editor-surface";
import { useEditorBinding } from "../src/editor/use-editor-binding";
import type { EditorBinding } from "../src/editor/use-editor-binding";
import { createStore } from "../src/store-runtime";
import type { Store } from "../src/store-runtime";
import { createManualClock } from "./support/clock";
import { act, renderUi, screen } from "./support/render";

function Harness(props: { store: Store; now: () => Date; out: { binding: EditorBinding | null } }) {
  const binding = useEditorBinding({ store: props.store, now: props.now, onCaret: () => {} });
  props.out.binding = binding;
  const empty = useSyncExternalStore(
    props.store.subscribe,
    () => props.store.getState().document.text.length === 0,
    () => true,
  );
  return <EditorSurface editor={binding.editor} empty={empty} />;
}

async function mount() {
  const clock = createManualClock();
  const store = createStore(clock.now);
  const out: { binding: EditorBinding | null } = { binding: null };
  await act(async () => {
    renderUi(<Harness store={store} now={clock.now} out={out} />);
    await Promise.resolve();
  });
  return { store, out };
}

describe("EditorSurface _Requirements: 6.5, 6.6, 10.3_", () => {
  it("shows an aria-hidden placeholder while empty and nothing else in the accessibility tree", async () => {
    await mount();
    const placeholder = screen.getByText(EDITOR_PLACEHOLDER);
    expect(placeholder.getAttribute("aria-hidden")).toBe("true");
    expect(EDITOR_PLACEHOLDER).toBe("Paste your draft here, or start typing.");
  });

  it("hides the placeholder after typing", async () => {
    const { out } = await mount();
    const view = out.binding?.editor?.view;
    if (view === undefined) throw new Error("no editor view");
    await act(async () => {
      view.dispatch(view.state.tr.insertText("hi", 1));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByText(EDITOR_PLACEHOLDER)).toBeNull();
  });

  it("exposes the Document textbox inside the main region", async () => {
    await mount();
    const box = screen.getByRole("textbox", { name: "Document" });
    expect(box.getAttribute("aria-multiline")).toBe("true");
    expect(screen.getByRole("main").contains(box)).toBe(true);
  });

  it("renders without an editor yet (server render shape)", () => {
    renderUi(<EditorSurface editor={null} empty={true} />);
    expect(screen.getByRole("main")).not.toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
