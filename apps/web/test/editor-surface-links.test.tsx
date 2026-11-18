// @vitest-environment jsdom
//
// Structure and event tests for the empty-page links of EditorSurface.
// _Requirements: 17.3, 17.4, 17.5, 17.7_
//
// What these tests CAN prove (DOM structure and event wiring):
//   - the link list is not inside the Editor's content element, and follows it in
//     DOM order (the tree-order half of the fix: later positioned siblings paint on top);
//   - the list renders only while `empty` is true and `onLoadSample` is given;
//   - the two links, their names and their order;
//   - `mousedown` on each link is default-prevented (the handler that stops a real
//     browser moving focus out of the editor), and `document.activeElement` is
//     unchanged by the synthetic event;
//   - a click calls `onLoadSample` with the right key.
//
// What they CANNOT prove: jsdom does no layout and no hit testing, so these tests
// cannot show paint order, that `document.elementFromPoint` returns a link, that the
// stylesheet's `pointer-events` rules apply, or how a real browser handles focus on
// mousedown. They also cannot send a real Enter key: jsdom does not turn Enter on an
// anchor into a click, so "keyboard activation" is modelled as the click a browser
// dispatches for Enter on a focused link. The old component (before the fix, commit
// 61c2836) rendered the list before the content element and had no `onMouseDown`,
// so the order and mousedown tests below fail against it; the rest pass on both. The
// real pointer path is the author's browser check.
import { describe, expect, it, vi } from "vitest";
import { useEditorBinding } from "../src/editor/use-editor-binding";
import { EditorSurface } from "../src/components/editor-surface";
import { createStore } from "../src/store-runtime";
import { createManualClock } from "./support/clock";
import { act, fireEvent, renderUi, screen } from "./support/render";

type Key = "demo" | "avianca";

function Harness(props: { empty: boolean; onLoadSample?: (key: Key) => void }) {
  const clock = createManualClock();
  const store = createStore(clock.now);
  const binding = useEditorBinding({ store, now: clock.now, onCaret: () => {} });
  const surface =
    props.onLoadSample === undefined ? (
      <EditorSurface editor={binding.editor} empty={props.empty} />
    ) : (
      <EditorSurface
        editor={binding.editor}
        empty={props.empty}
        onLoadSample={props.onLoadSample}
      />
    );
  return surface;
}

async function mount(empty: boolean, onLoadSample?: (key: Key) => void) {
  await act(async () => {
    renderUi(
      onLoadSample === undefined ? (
        <Harness empty={empty} />
      ) : (
        <Harness empty={empty} onLoadSample={onLoadSample} />
      ),
    );
    await Promise.resolve();
  });
}

function links(): readonly HTMLElement[] {
  return [
    screen.getByRole("link", { name: "Load the Avianca citations" }),
    screen.getByRole("link", { name: "Load demo motion" }),
  ];
}

/** The Editor's content element: the wrapper EditorContent renders around `.ProseMirror`. */
function contentElement(): HTMLElement {
  const parent = screen.getByRole("textbox", { name: "Document" }).parentElement;
  if (parent === null) throw new Error("no content element");
  return parent;
}

describe("EditorSurface empty-page links: structure _Requirements: 17.3, 17.7_", () => {
  it("renders the list after the content element and outside it", async () => {
    await mount(true, () => {});
    const content = contentElement();
    const list = links()[0]?.closest("ul");
    if (list === null || list === undefined) throw new Error("no list");
    expect(content.contains(list)).toBe(false);
    expect(list.contains(content)).toBe(false);
    expect(content.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders the two links as anchors, in order", async () => {
    await mount(true, () => {});
    const found = links();
    expect(found.map((a) => a.tagName)).toEqual(["A", "A"]);
    expect(found.map((a) => a.textContent)).toEqual([
      "Load the Avianca citations",
      "Load demo motion",
    ]);
    expect(found[0]?.compareDocumentPosition(found[1] as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("renders no links when the page is not empty", async () => {
    await mount(false, () => {});
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders no links when onLoadSample is not given", async () => {
    await mount(true);
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("EditorSurface empty-page links: events _Requirements: 17.4, 17.5_", () => {
  it("default-prevents mousedown on each link and leaves focus where it was", async () => {
    await mount(true, () => {});
    const box = screen.getByRole("textbox", { name: "Document" });
    box.focus();
    const before = document.activeElement;
    for (const link of links()) {
      // fireEvent returns false when preventDefault was called on a cancelable event.
      expect(fireEvent.mouseDown(link)).toBe(false);
      expect(document.activeElement).toBe(before);
    }
  });

  it("calls onLoadSample with the key for a click on each link", async () => {
    const onLoadSample = vi.fn<(key: Key) => void>();
    await mount(true, onLoadSample);
    const [avianca, demo] = links();
    if (demo === undefined || avianca === undefined) throw new Error("links missing");
    expect(fireEvent.click(avianca)).toBe(false);
    expect(fireEvent.click(demo)).toBe(false);
    expect(onLoadSample.mock.calls).toEqual([["avianca"], ["demo"]]);
  });

  it("activates from the keyboard: each link takes focus and its Enter click loads", async () => {
    const onLoadSample = vi.fn<(key: Key) => void>();
    await mount(true, onLoadSample);
    const [avianca, demo] = links();
    if (demo === undefined || avianca === undefined) throw new Error("links missing");
    for (const link of [avianca, demo]) {
      expect(link.getAttribute("href")).not.toBeNull();
      link.focus();
      expect(document.activeElement).toBe(link);
      link.click();
    }
    expect(onLoadSample.mock.calls).toEqual([["avianca"], ["demo"]]);
  });
});
