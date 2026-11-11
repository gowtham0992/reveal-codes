// @vitest-environment jsdom
import { EditorContent } from "@tiptap/react";
import { createDocument, issues } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { MARKS_META } from "../src/editor/marks-plugin";
import { docText } from "../src/editor/offsets";
import { useEditorBinding } from "../src/editor/use-editor-binding";
import type { EditorBinding } from "../src/editor/use-editor-binding";
import { createStore } from "../src/store-runtime";
import type { Store } from "../src/store-runtime";
import { createManualClock } from "./support/clock";
import { act, renderUi } from "./support/render";

const ISO = "2026-11-02T12:00:00.000Z";
const CITE = "Roe v. Wade, 410 U.S. 113, 120 (1973)";
const SPAN = "410 U.S. 113, 120 (1973)";
const TEXT = `Intro line.\nSee ${CITE}.`;

type Harness = { store: Store; editor: NonNullable<EditorBinding["editor"]> };

function Probe(props: { store: Store; now: () => Date; out: { binding: EditorBinding | null } }) {
  const binding = useEditorBinding({ store: props.store, now: props.now, onCaret: () => {} });
  props.out.binding = binding;
  return <EditorContent editor={binding.editor} />;
}

const flush = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

async function mount(): Promise<Harness> {
  const clock = createManualClock();
  const store = createStore(clock.now);
  const out: { binding: EditorBinding | null } = { binding: null };
  await act(async () => {
    renderUi(<Probe store={store} now={clock.now} out={out} />);
    await Promise.resolve();
  });
  const editor = out.binding?.editor;
  if (editor === null || editor === undefined) throw new Error("no editor");
  const created = createDocument(TEXT, ISO);
  if (!created.ok) throw new Error("fixture rejected");
  act(() => {
    store.dispatch({ type: "replace", document: created.value });
  });
  await flush();
  return { store, editor };
}

function citationKey(store: Store): string {
  const issue = issues(store.getState().document).find((i) => i.kind === "citation");
  if (issue === undefined) throw new Error("no citation");
  return issue.key;
}

async function runVerify(h: Harness, status: "not_found" | "ambiguous"): Promise<void> {
  const result = status === "not_found" ? { status } : { status, candidates: ["1", "2"] };
  act(() => {
    h.store.dispatch({ type: "verification", pairs: [[citationKey(h.store), result]] });
  });
  await flush();
}

function marks(h: Harness): HTMLElement[] {
  return Array.from(h.editor.view.dom.querySelectorAll<HTMLElement>("[data-issue]"));
}

describe("marks plugin _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 12.10_", () => {
  it("draws no marks while Check_Time is null, then marks with titles after a Verify run", async () => {
    const h = await mount();
    await runVerify(h, "not_found");
    expect(h.store.getState().verifiedAt).toBeNull();
    expect(marks(h)).toEqual([]);

    act(() => {
      h.store.dispatch({ type: "verified", at: ISO });
    });
    await flush();
    const drawn = marks(h);
    expect(drawn.map((m) => m.textContent)).toEqual([SPAN]);
    expect(drawn[0]?.getAttribute("data-issue")).toBe("CIT ✘");
    expect(drawn[0]?.getAttribute("title")).toBe("Citation not found");
  });

  it("a marks transaction leaves the Document text, undo stack and operations unchanged", async () => {
    const h = await mount();
    await runVerify(h, "ambiguous");
    act(() => {
      h.store.dispatch({ type: "verified", at: ISO });
    });
    await flush();
    expect(marks(h)[0]?.getAttribute("title")).toBe("Citation ambiguous");

    const before = h.store.getState();
    const textBefore = docText(h.editor.state.doc);
    let docChanged = false;
    const watch = (p: { transaction: { docChanged: boolean } }): void => {
      docChanged = docChanged || p.transaction.docChanged;
    };
    h.editor.on("transaction", watch);
    act(() => {
      h.editor.view.dispatch(h.editor.state.tr.setMeta(MARKS_META, []));
    });
    await flush();
    h.editor.off("transaction", watch);

    expect(docChanged).toBe(false);
    expect(docText(h.editor.state.doc)).toBe(textBefore);
    expect(h.store.getState().document).toBe(before.document);
    expect(h.store.getState().undo).toBe(before.undo);
    expect(h.store.getState().undo).toHaveLength(before.undo.length);
  });

  it("a mark follows an edit made before it", async () => {
    const h = await mount();
    await runVerify(h, "not_found");
    act(() => {
      h.store.dispatch({ type: "verified", at: ISO });
    });
    await flush();

    act(() => {
      h.editor.view.dispatch(h.editor.state.tr.insertText("XY", 1));
    });
    // Mapped through the transaction before the Store has caught up.
    expect(marks(h).map((m) => m.textContent)).toEqual([SPAN]);
    await flush();
    expect(docText(h.editor.state.doc)).toBe(`XYIntro line.\nSee ${CITE}.`);
    expect(h.store.getState().document.text).toBe(docText(h.editor.state.doc));
    expect(marks(h).map((m) => m.textContent)).toEqual([SPAN]);
  });

  it("a mark goes away when an edit inside it turns the item unchecked", async () => {
    const h = await mount();
    await runVerify(h, "not_found");
    act(() => {
      h.store.dispatch({ type: "verified", at: ISO });
    });
    await flush();
    expect(marks(h)).toHaveLength(1);

    const inside = TEXT.indexOf("120") + 2; // Offset in the second paragraph; Pos = Offset + 2
    act(() => {
      h.editor.view.dispatch(h.editor.state.tr.insertText("9", inside + 2));
    });
    await flush();
    const codes = issues(h.store.getState().document).map((i) => i.code);
    expect(codes).toContain("CIT …");
    expect(marks(h)).toEqual([]);
  });
});
