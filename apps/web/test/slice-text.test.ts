import { Fragment, Slice } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";
import { editorSchema } from "../src/editor/schema";
import { sliceToText, textToSlice } from "../src/editor/slice-text";

const para = (text: string) =>
  editorSchema.node("paragraph", null, text === "" ? [] : [editorSchema.text(text)]);

describe("textToSlice", () => {
  it("gives Slice.empty for the empty string", () => {
    expect(textToSlice(editorSchema, "").size).toBe(0);
  });
  it("gives an open 0/0 text slice for one line", () => {
    const slice = textToSlice(editorSchema, "abc");
    expect([slice.openStart, slice.openEnd]).toEqual([0, 0]);
    expect(slice.content.firstChild?.isText).toBe(true);
  });
  it("gives open 1/1 paragraphs for several lines", () => {
    const slice = textToSlice(editorSchema, "a\n\nb");
    expect([slice.openStart, slice.openEnd]).toEqual([1, 1]);
    expect(slice.content.childCount).toBe(3);
  });
});

describe("sliceToText", () => {
  it("round trips textToSlice", () => {
    for (const text of ["", "x", "a\nb", "a\n\nb\n", "😀\n😀"]) {
      expect(sliceToText(textToSlice(editorSchema, text))).toBe(text);
    }
  });
  it("is null for a text node holding a newline", () => {
    const slice = new Slice(Fragment.from(editorSchema.text("a\nb")), 0, 0);
    expect(sliceToText(slice)).toBeNull();
  });
  it("is null for a node outside the schema content model", () => {
    const slice = new Slice(Fragment.from(para("a")), 0, 0);
    const mixed = new Slice(Fragment.fromArray([editorSchema.text("t"), para("a")]), 0, 0);
    expect(sliceToText(slice)).toBe("a");
    expect(sliceToText(mixed)).toBeNull();
  });
});
