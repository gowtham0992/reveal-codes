// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CallerOperation } from "@reveal-codes/engine";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { EditorView } from "@tiptap/pm/view";
import { afterEach, describe, expect, it } from "vitest";
import {
  PROVENANCE_META,
  RECONCILE_META,
  createProvenancePlugin,
  provenanceFor,
} from "../src/editor/provenance-plugin";
import { docFromText, docText } from "../src/editor/offsets";
import { editorSchema } from "../src/editor/schema";
import "./support/dom-shims";
import {
  buildPasteTransaction,
  buildTransaction,
  stateFromText,
  withSelection,
} from "./support/pm";

const ISO = "2026-02-03T04:05:06.000Z";
const now = () => new Date(ISO);

describe("provenanceFor", () => {
  const state = withSelection(stateFromText("hello\nworld"), 6);

  it("is HUM for typing, IME-style replace, Enter, Backspace, Delete and cut", () => {
    const edits = [
      state.tr.insertText("x", 6),
      state.tr.insertText("yy", 2, 4),
      state.tr.split(3),
      state.tr.delete(5, 6),
      state.tr.delete(7, 8),
      state.tr.delete(1, 4).setMeta("uiEvent", "cut"),
    ];
    for (const tr of edits)
      expect(provenanceFor(tr, now)).toEqual({ origin: "HUM", timestamp: ISO });
  });

  it("is PST for a paste transaction and for paste or drop uiEvent without meta", () => {
    const pst = { origin: "PST", timestamp: ISO };
    expect(provenanceFor(buildPasteTransaction(state, "zz"), now)).toEqual(pst);
    expect(provenanceFor(state.tr.insertText("a").setMeta("uiEvent", "paste"), now)).toEqual(pst);
    expect(provenanceFor(state.tr.insertText("a").setMeta("uiEvent", "drop"), now)).toEqual(pst);
  });

  it("meta wins over an unmarked transaction", () => {
    const tr = state.tr.insertText("a").setMeta(PROVENANCE_META, { origin: "PST" });
    expect(provenanceFor(tr, now)?.origin).toBe("PST");
  });

  it("is null for Reconcile and for transactions that change nothing", () => {
    expect(provenanceFor(state.tr.insertText("a").setMeta(RECONCILE_META, true), now)).toBeNull();
    expect(provenanceFor(state.tr, now)).toBeNull();
  });

  it("takes timestamps from the injected clock", () => {
    const later = () => new Date("2030-01-01T00:00:00.000Z");
    expect(provenanceFor(state.tr.insertText("a"), later)?.timestamp).toBe(
      "2030-01-01T00:00:00.000Z",
    );
  });
});

describe("plugin state and view", () => {
  it("computes ops from a transaction with no view", () => {
    const plugin = createProvenancePlugin({ now, onEdit: () => undefined });
    const s = EditorState.create({
      doc: docFromText(editorSchema, "ab"),
      schema: editorSchema,
      plugins: [plugin],
    });
    const next = s.apply(buildTransaction(s, [{ kind: "insert", at: 1, text: "Z" }]));
    expect(docText(next.doc)).toBe("aZb");
  });
});

describe("with a mounted view", () => {
  const views: EditorView[] = [];
  afterEach(() => {
    while (views.length > 0) views.pop()?.destroy();
  });

  function mount(text: string) {
    const calls: (readonly CallerOperation[])[] = [];
    const plugin = createProvenancePlugin({ now, onEdit: (ops) => calls.push(ops) });
    const view = new EditorView(document.createElement("div"), {
      state: EditorState.create({
        doc: docFromText(editorSchema, text),
        schema: editorSchema,
        plugins: [plugin],
      }),
    });
    views.push(view);
    return { view, plugin, calls };
  }

  const clip = (types: Record<string, string>) =>
    ({
      clipboardData: { getData: (t: string) => types[t] ?? "" },
      preventDefault: () => undefined,
    }) as unknown as ClipboardEvent;

  it("flushes HUM ops once per edit", () => {
    const { view, calls } = mount("ab");
    view.dispatch(view.state.tr.insertText("Z", 2));
    view.dispatch(view.state.tr.setMeta("noop", true));
    expect(calls).toEqual([
      [{ kind: "insert", at: 1, text: "Z", provenance: { origin: "HUM", timestamp: ISO } }],
    ]);
  });

  it("emits nothing for a Reconcile transaction", () => {
    const { view, calls } = mount("ab");
    view.dispatch(view.state.tr.insertText("Q", 1).setMeta(RECONCILE_META, true));
    expect(calls).toEqual([]);
  });

  it("paste replaces the selection and is PST, CRLF normalised", () => {
    const { view, plugin, calls } = mount("hello");
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 3)));
    const handled = plugin.props.handlePaste?.call(
      plugin,
      view,
      clip({ "text/plain": "X\r\nY" }),
      null as never,
    );
    expect(handled).toBe(true);
    expect(docText(view.state.doc)).toBe("X\nYllo");
    expect(calls[0]?.[0]).toMatchObject({ kind: "replace", provenance: { origin: "PST" } });
  });

  it("paste with no text/plain leaves the document unchanged", () => {
    const { view, plugin, calls } = mount("hello");
    const handled = plugin.props.handlePaste?.call(
      plugin,
      view,
      clip({ "text/html": "<b>x</b>" }),
      null as never,
    );
    expect(handled).toBe(true);
    expect(docText(view.state.doc)).toBe("hello");
    expect(calls).toEqual([]);
  });

  it("cancels historyUndo and historyRedo beforeinput events only", () => {
    const { view, plugin } = mount("a");
    const fire = (inputType: string) => {
      const event = new InputEvent("beforeinput", { cancelable: true });
      Object.defineProperty(event, "inputType", { value: inputType });
      plugin.props.handleDOMEvents?.beforeinput?.call(plugin, view, event);
      return event.defaultPrevented;
    };
    expect(fire("historyUndo")).toBe(true);
    expect(fire("historyRedo")).toBe(true);
    expect(fire("insertText")).toBe(false);
  });
});

describe("static", () => {
  it("no editor module constructs the AI-then-human origin", () => {
    const needle = ["AI", "HUM"].join(">");
    for (const f of ["provenance-plugin", "clipboard", "meta"]) {
      const source = readFileSync(join(__dirname, "..", "src/editor", `${f}.ts`), "utf8");
      expect(source.includes(needle)).toBe(false);
    }
  });
});
