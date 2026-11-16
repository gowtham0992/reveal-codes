// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { useSyncExternalStore } from "react";
import { createDocument } from "@reveal-codes/engine";
import { lineAt, lnPos } from "../src/pane/layout";
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
    expect(EDITOR_PLACEHOLDER).toBe("Type or paste your filing here, or open a draft.");
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
    expect(box.getAttribute("spellcheck")).toBe("false");
    expect(screen.getByRole("main").contains(box)).toBe(true);
  });

  it("renders without an editor yet (server render shape)", () => {
    renderUi(<EditorSurface editor={null} empty={true} />);
    expect(screen.getByRole("main")).not.toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

const LONG_LINE = Array.from({ length: 80 }, (_, i) => `word${String(i)}`).join(" ");
const LINE_TEXTS: readonly (readonly [string, string])[] = [
  ["the empty text", ""],
  ["one line", "one line"],
  ["a blank line between", "a\n\nb"],
  ["a long line that wraps", LONG_LINE],
];

async function mountWithText(text: string) {
  const mounted = await mount();
  const created = createDocument(text, "2026-11-02T12:00:00.000Z");
  if (!created.ok) throw new Error("fixture rejected");
  await act(async () => {
    mounted.store.dispatch({ type: "replace", document: created.value });
    await Promise.resolve();
    await Promise.resolve();
  });
  const root = screen.getByRole("textbox", { name: "Document" });
  return { ...mounted, root };
}

describe("EditorSurface line markup _Requirements: 5.9, 5.10, 5.11, 5.12, 5.13_", () => {
  it.each(LINE_TEXTS)(
    "has exactly one p child per newline-separated line for %s",
    async (_name, text) => {
      const { root } = await mountWithText(text);
      const children = Array.from(root.children);
      expect(children.map((c) => c.tagName)).toEqual(text.split("\n").map(() => "P"));
      expect(children.map((c) => c.textContent)).toEqual(text.split("\n"));
    },
  );

  it("puts no line number in the DOM text", async () => {
    const { root } = await mountWithText("a\n\nb");
    expect(root.textContent).toBe("ab");
  });

  it.each(LINE_TEXTS)(
    "numbers each line (1 plus its paragraph index) as the Status_Line Ln for %s",
    async (_name, text) => {
      const { root } = await mountWithText(text);
      const paragraphs = Array.from(root.children);
      let offset = 0;
      paragraphs.forEach((p, index) => {
        const counter = index + 1;
        const ln = /^Ln (\d+) /.exec(lnPos(text, offset));
        expect(Number(ln?.[1])).toBe(counter);
        const end = offset + p.textContent.length;
        expect(lineAt(text, end)).toBe(counter);
        offset = end + 1;
      });
    },
  );

  it("shows the placeholder only for the empty text, hidden from assistive technology", async () => {
    await mountWithText("");
    expect(screen.getByText(EDITOR_PLACEHOLDER).getAttribute("aria-hidden")).toBe("true");
  });
});
