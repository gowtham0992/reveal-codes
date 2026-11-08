import { describe, expect, it } from "vitest";
import { docFromText, docText, offsetToPos, posToOffset } from "../src/editor/offsets";
import { editorSchema } from "../src/editor/schema";

const docOf = (text: string) => docFromText(editorSchema, text);

describe("editorSchema", () => {
  it("is doc > paragraph > text only", () => {
    expect(Object.keys(editorSchema.nodes).sort()).toEqual(["doc", "paragraph", "text"]);
  });
});

describe("empty document", () => {
  it("is one empty paragraph with Offset 0 at Pos 1", () => {
    const doc = docOf("");
    expect(doc.childCount).toBe(1);
    expect(docText(doc)).toBe("");
    expect(offsetToPos(doc, 0)).toBe(1);
    expect(posToOffset(doc, 1)).toBe(0);
    expect(offsetToPos(doc, 1)).toBeNull();
  });
});

describe("newline boundaries", () => {
  const doc = docOf("ab\ncde");
  it("maps the Offset of the newline to the end of its paragraph", () => {
    expect(docText(doc)).toBe("ab\ncde");
    expect(offsetToPos(doc, 2)).toBe(3);
  });
  it("maps the next Offset to the start of the next paragraph", () => {
    expect(offsetToPos(doc, 3)).toBe(5);
    expect(offsetToPos(doc, 6)).toBe(8);
  });
  it("maps Pos back to Offsets across the boundary", () => {
    expect(posToOffset(doc, 3)).toBe(2);
    expect(posToOffset(doc, 5)).toBe(3);
    expect(posToOffset(doc, 8)).toBe(6);
  });
  it("keeps empty middle paragraphs addressable", () => {
    const d = docOf("a\n\nb");
    expect(offsetToPos(d, 2)).toBe(4);
    expect(offsetToPos(d, 3)).toBe(6);
    expect(posToOffset(d, 4)).toBe(2);
  });
});

describe("null results", () => {
  const doc = docOf("ab\ncd");
  it("rejects negative, fractional, non-finite and past-the-end Offsets", () => {
    expect(offsetToPos(doc, -1)).toBeNull();
    expect(offsetToPos(doc, 1.5)).toBeNull();
    expect(offsetToPos(doc, Number.NaN)).toBeNull();
    expect(offsetToPos(doc, Number.POSITIVE_INFINITY)).toBeNull();
    expect(offsetToPos(doc, 6)).toBeNull();
  });
  it("rejects doc-level Pos and paragraph open and close tokens", () => {
    expect(posToOffset(doc, 0)).toBeNull();
    expect(posToOffset(doc, 4)).toBeNull();
    expect(posToOffset(doc, 8)).toBeNull();
    expect(posToOffset(doc, -1)).toBeNull();
    expect(posToOffset(doc, 1.5)).toBeNull();
  });
});

describe("surrogate pairs", () => {
  it("count as two units", () => {
    const doc = docOf("😀x");
    expect(docText(doc).length).toBe(3);
    expect(offsetToPos(doc, 2)).toBe(3);
    expect(posToOffset(doc, 4)).toBe(3);
  });
});

describe("docFromText and docText", () => {
  it.each(["", "a", "a\nb", "\n", "a\n\nb\n", "[x]\\ 😀\nz"])("round trip %j", (text) => {
    expect(docText(docOf(text))).toBe(text);
    expect(docOf(text).childCount).toBe(text.split("\n").length);
  });
});
