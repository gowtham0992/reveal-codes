import { describe, expect, it } from "vitest";
import {
  buildDropTransaction,
  buildPasteTransaction,
  normaliseNewlines,
  plainTextOf,
} from "../src/editor/clipboard";
import { docText } from "../src/editor/offsets";
import { PROVENANCE_META } from "../src/editor/meta";
import { stateFromText, withSelection } from "./support/pm";

const data = (map: Record<string, string>) => ({ getData: (type: string) => map[type] ?? "" });

describe("normaliseNewlines", () => {
  it("turns CRLF and CR into LF and leaves LF alone", () => {
    expect(normaliseNewlines("a\r\nb\rc\nd")).toBe("a\nb\nc\nd");
    expect(normaliseNewlines("\r\r\n")).toBe("\n\n");
  });
});

describe("plainTextOf", () => {
  it("reads only text/plain and normalises it", () => {
    const d = data({ "text/plain": "x\r\ny", "text/html": "<b>no</b>" });
    expect(plainTextOf(d)).toBe("x\ny");
  });

  it("is null without text/plain, or without data", () => {
    expect(plainTextOf(data({ "text/html": "<b>x</b>" }))).toBeNull();
    expect(plainTextOf(null)).toBeNull();
  });
});

describe("buildPasteTransaction", () => {
  it("marks the transaction as a PST paste and replaces the selection", () => {
    const state = withSelection(stateFromText("hello world"), 1, 6);
    const tr = buildPasteTransaction(state, "bye");
    expect(tr.getMeta("uiEvent")).toBe("paste");
    expect(tr.getMeta(PROVENANCE_META)).toEqual({ origin: "PST" });
    expect(docText(tr.doc)).toBe("bye world");
  });

  it("inserts several lines as paragraphs", () => {
    const tr = buildPasteTransaction(withSelection(stateFromText("ab"), 2), "p\nq");
    expect(docText(tr.doc)).toBe("ap\nqb");
  });
});

describe("buildDropTransaction", () => {
  it("copy-drop inserts at the position and keeps the selection text", () => {
    const state = withSelection(stateFromText("abcd"), 1, 3);
    const tr = buildDropTransaction(state, "X", 5, false);
    expect(docText(tr.doc)).toBe("abcdX");
    expect(tr.getMeta("uiEvent")).toBe("drop");
  });

  it("move-drop deletes the dragged selection first and maps the position", () => {
    const state = withSelection(stateFromText("abcd"), 1, 3);
    const tr = buildDropTransaction(state, "ab", 5, true);
    expect(docText(tr.doc)).toBe("cdab");
    expect(tr.getMeta(PROVENANCE_META)).toEqual({ origin: "PST" });
  });
});
