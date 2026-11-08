import { Document } from "@tiptap/extension-document";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Text } from "@tiptap/extension-text";
import { getSchema } from "@tiptap/core";
import { EditorState } from "@tiptap/pm/state";
import { Fragment, Slice } from "@tiptap/pm/model";
import { ReplaceAroundStep, ReplaceStep } from "@tiptap/pm/transform";
import { describe, expect, it } from "vitest";

const schema = getSchema([Document, Paragraph, Text]);

function stateOf(...lines: string[]): EditorState {
  const paragraphs = lines.map((line) =>
    schema.node("paragraph", null, line === "" ? [] : [schema.text(line)]),
  );
  return EditorState.create({ doc: schema.node("doc", null, paragraphs) });
}

describe("API notes 6 to 10 (Node, no DOM)", () => {
  it("getSchema of the three extensions is doc > paragraph > text", () => {
    expect(Object.keys(schema.nodes).sort()).toEqual(["doc", "paragraph", "text"]);
    expect(schema.topNodeType.name).toBe("doc");
    expect(schema.nodes["doc"]?.spec.content).toBe("block+");
    expect(schema.nodes["paragraph"]?.spec.content).toBe("inline*");
    expect(schema.nodes["paragraph"]?.isTextblock).toBe(true);
  });

  it("insertText gives a ReplaceStep with a text slice of open depths 0/0", () => {
    const tr = stateOf("abc").tr.insertText("X", 2);
    const step = tr.steps[0];
    expect(step).toBeInstanceOf(ReplaceStep);
    const slice = (step as ReplaceStep).slice;
    expect([slice.openStart, slice.openEnd]).toEqual([0, 0]);
    expect(slice.content.childCount).toBe(1);
    expect(slice.content.firstChild?.isText).toBe(true);
  });

  it("split gives a ReplaceStep with a paragraph slice of open depths 1/1", () => {
    const tr = stateOf("abcd").tr.split(3);
    const step = tr.steps[0];
    expect(step).toBeInstanceOf(ReplaceStep);
    const slice = (step as ReplaceStep).slice;
    expect([slice.openStart, slice.openEnd]).toEqual([1, 1]);
    expect(slice.content.childCount).toBe(2);
    expect(slice.content.firstChild?.type.name).toBe("paragraph");
    expect(tr.doc.textBetween(0, tr.doc.content.size, "\n")).toBe("ab\ncd");
  });

  it("deleting a range gives a ReplaceStep with an empty slice", () => {
    const tr = stateOf("abcd").tr.delete(2, 4);
    const step = tr.steps[0];
    expect(step).toBeInstanceOf(ReplaceStep);
    expect((step as ReplaceStep).slice.size).toBe(0);
  });

  it("insertText with a newline puts a literal newline inside a text node", () => {
    const tr = stateOf("ab").tr.insertText("x\ny", 2);
    const slice = (tr.steps[0] as ReplaceStep).slice;
    expect(slice.content.firstChild?.text).toBe("x\ny");
  });

  it("replaceWith over the whole document carries custom meta", () => {
    const state = stateOf("old");
    const fragment = Fragment.from(schema.node("paragraph", null, [schema.text("new")]));
    const tr = state.tr.replaceWith(0, state.doc.content.size, fragment);
    tr.setMeta("revealCodes/reconcile", { epoch: 3 });
    expect(tr.getMeta("revealCodes/reconcile")).toEqual({ epoch: 3 });
    const next = state.apply(tr);
    expect(next.doc.textContent).toBe("new");
    expect(tr.steps[0]).toBeInstanceOf(ReplaceStep);
  });

  it("a ReplaceAroundStep can be constructed by hand and applied", () => {
    const state = stateOf("ab");
    const step = new ReplaceAroundStep(0, 4, 0, 4, new Slice(Fragment.empty, 0, 0), 0, false);
    expect(step).toBeInstanceOf(ReplaceAroundStep);
    expect(step).not.toBeInstanceOf(ReplaceStep);
    const result = step.apply(state.doc);
    expect(result.failed ?? null).toBeNull();
  });
});
