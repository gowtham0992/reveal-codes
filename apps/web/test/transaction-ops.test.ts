import { apply, createDocument } from "@reveal-codes/engine";
import type { Document, Provenance } from "@reveal-codes/engine";
import { ReplaceAroundStep, ReplaceStep } from "@tiptap/pm/transform";
import { Fragment, Slice } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import { docText } from "../src/editor/offsets";
import { editorSchema } from "../src/editor/schema";
import { mapSteps, transactionToOps } from "../src/editor/transaction-ops";
import {
  buildPasteTransaction,
  buildTransaction,
  posIn,
  stateFromText,
  withSelection,
} from "./support/pm";

const ISO = "2026-01-01T00:00:00.000Z";
const hum: Provenance = { origin: "HUM", timestamp: ISO };
const pst: Provenance = { origin: "PST", timestamp: ISO };
const para = (text: string) =>
  editorSchema.node("paragraph", null, text === "" ? [] : [editorSchema.text(text)]);

function mirror(before: string, steps: Parameters<typeof mapSteps>[1], p: Provenance): string {
  const created = createDocument(before, ISO);
  if (!created.ok) throw new Error("fixture rejected");
  let doc: Document = created.value;
  for (const op of transactionToOps(before, steps, p)) {
    const applied = apply(doc, op);
    if (!applied.ok) throw new Error(`engine rejected ${applied.error.kind}`);
    doc = applied.value.document;
  }
  return doc.text;
}

describe("classification", () => {
  it("emits an insert for typing", () => {
    const s = stateFromText("ab");
    const tr = buildTransaction(s, [{ kind: "insert", at: 1, text: "X" }]);
    const m = mapSteps("ab", tr.steps, hum);
    expect(m.path).toBe("mapped");
    expect(m.ops).toEqual([{ kind: "insert", at: 1, text: "X", provenance: hum }]);
  });
  it("emits a delete whose actor is the origin", () => {
    const tr = buildTransaction(stateFromText("abc"), [{ kind: "delete", from: 1, to: 2 }]);
    const m = mapSteps("abc", tr.steps, pst);
    expect(m.path).toBe("mapped");
    expect(m.ops).toEqual([{ kind: "delete", from: 1, to: 2, actor: "PST" }]);
  });
  it("emits a replace carrying the provenance", () => {
    const tr = buildTransaction(stateFromText("abc"), [
      { kind: "replace", from: 0, to: 2, text: "Z" },
    ]);
    expect(mapSteps("abc", tr.steps, hum).ops).toEqual([
      { kind: "replace", from: 0, to: 2, text: "Z", provenance: hum },
    ]);
  });
  it("emits nothing for a step that removes and inserts nothing", () => {
    const state = stateFromText("abc");
    const step = new ReplaceStep(2, 2, Slice.empty);
    expect(mapSteps("abc", [step], hum)).toEqual({ ops: [], path: "mapped" });
    expect(state.doc.textContent).toBe("abc");
  });
});

describe("mapped path", () => {
  it("maps Enter, Backspace across a boundary and paste", () => {
    const enter = buildTransaction(stateFromText("ab"), [{ kind: "split", at: 1 }]);
    expect(mapSteps("ab", enter.steps, hum)).toMatchObject({
      path: "mapped",
      ops: [{ kind: "insert", at: 1, text: "\n" }],
    });
    const back = buildTransaction(stateFromText("a\nb"), [{ kind: "join", which: 0 }]);
    expect(mapSteps("a\nb", back.steps, hum)).toMatchObject({
      path: "mapped",
      ops: [{ kind: "delete", from: 1, to: 2 }],
    });
    const paste = buildPasteTransaction(withSelection(stateFromText("xy"), 2), "p\nq");
    expect(mapSteps("xy", paste.steps, pst)).toMatchObject({
      path: "mapped",
      ops: [{ kind: "insert", at: 1, text: "p\nq" }],
    });
  });
  it("keeps the Engine text equal to the editor text across several steps", () => {
    const state = stateFromText("hello\nworld");
    const tr = buildTransaction(state, [
      { kind: "paste", from: 2, to: 8, text: "A\nB\nC" },
      { kind: "delete", from: 0, to: 1 },
      { kind: "split", at: 3 },
    ]);
    expect(mirror("hello\nworld", tr.steps, hum)).toBe(docText(tr.doc));
  });
});

describe("fallback path", () => {
  it("handles a hand-built ReplaceAroundStep", () => {
    const state = stateFromText("abc");
    const wrapper = new Slice(Fragment.from(para("X")), 0, 0);
    const step = new ReplaceAroundStep(0, 5, 1, 4, wrapper, 2, true);
    const result = step.apply(state.doc);
    expect(result.failed).toBeNull();
    const m = mapSteps("abc", [step], hum);
    expect(m.path).toBe("fallback");
    expect(m.ops).toEqual([{ kind: "replace", from: 0, to: 0, text: "X", provenance: hum }]);
    expect(mirror("abc", [step], hum)).toBe("Xabc");
    expect(result.doc === null ? null : docText(result.doc)).toBe("Xabc");
  });
  it("handles a slice holding a non-paragraph node", () => {
    const heading = editorSchema.node("paragraph", null, [editorSchema.text("zz")]);
    const step = new ReplaceStep(0, 5, new Slice(Fragment.from(heading), 0, 0));
    const m = mapSteps("abc", [step], hum);
    expect(m.path).toBe("fallback");
    expect(m.ops).toEqual([{ kind: "replace", from: 0, to: 3, text: "zz", provenance: hum }]);
  });
  it("handles a text node holding a newline", () => {
    const step = new ReplaceStep(2, 2, new Slice(Fragment.from(editorSchema.text("x\ny")), 0, 0));
    const m = mapSteps("abc", [step], hum);
    expect(m.path).toBe("fallback");
    expect(m.ops).toEqual([{ kind: "replace", from: 1, to: 1, text: "x\ny", provenance: hum }]);
  });
  it("returns no operation when the texts are equal", () => {
    const wrapper = new Slice(Fragment.from(para("")), 0, 0);
    const step = new ReplaceAroundStep(0, 5, 1, 4, wrapper, 1, true);
    expect(step.apply(stateFromText("abc").doc).failed).toBeNull();
    expect(mapSteps("abc", [step], hum)).toEqual({ ops: [], path: "fallback" });
  });
  it("returns no operation when a step cannot apply", () => {
    const step = new ReplaceStep(50, 60, Slice.empty);
    expect(mapSteps("abc", [step], hum)).toEqual({ ops: [], path: "fallback" });
  });
  it("moves the cut points off surrogate pairs", () => {
    // 😀 and 😁 share the high surrogate; a naive common prefix would stop inside the pair.
    const before = "a😀b";
    const replacement = new Slice(Fragment.from(editorSchema.text("a😁b\n")), 0, 0);
    const step = new ReplaceStep(1, 5, replacement);
    const m = mapSteps(before, [step], hum);
    expect(m.path).toBe("fallback");
    expect(m.ops).toEqual([{ kind: "replace", from: 1, to: 4, text: "😁b\n", provenance: hum }]);
    expect(mirror(before, [step], hum)).toBe("a😁b\n");
  });
});

describe("provenance", () => {
  it("is the supplied object in every insert and replace", () => {
    const tr = buildTransaction(stateFromText("abc"), [
      { kind: "insert", at: 0, text: "x" },
      { kind: "replace", from: 1, to: 2, text: "y" },
    ]);
    const ops = transactionToOps("abc", tr.steps, hum);
    expect(ops.length).toBeGreaterThan(0);
    for (const op of ops) if (op.kind !== "delete") expect(op.provenance).toBe(hum);
  });
  it("posIn agrees with offsets", () => {
    const doc = stateFromText("ab\ncd").doc;
    expect(posIn(doc, 1, 1)).toBe(6);
    expect(TextSelection.create(doc, posIn(doc, 0, 0)).from).toBe(1);
  });
});
