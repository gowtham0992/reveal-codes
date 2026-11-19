import { describe, expect, it } from "vitest";
import { trimHunk } from "../src/core/trim.js";

const whole = (old: string, text: string) => ({ from: 0, to: old.length, text });

describe("trimHunk", () => {
  it("keeps only the one changed character of a typo fix", () => {
    const old = "the quikk fox\n";
    expect(trimHunk(old, whole(old, "the quick fox\n"))).toEqual({ from: 7, to: 8, text: "c" });
  });

  it("gives only the inserted characters for an insert at the start and at the end of a line", () => {
    expect(trimHunk("line\n", whole("line\n", ">> line\n"))).toEqual({
      from: 0,
      to: 0,
      text: ">> ",
    });
    expect(trimHunk("line\n", whole("line\n", "line!!\n"))).toEqual({ from: 4, to: 4, text: "!!" });
  });

  it("offsets into the whole old text", () => {
    const doc = "aa\nbxb\ncc\n";
    expect(trimHunk(doc, { from: 3, to: 7, text: "byb\n" })).toEqual({ from: 4, to: 5, text: "y" });
  });

  it("does not split CR LF when the last character before it is edited", () => {
    const old = "ab\r\n";
    // Common suffix is "\r\n"; the edit of "b" keeps the pair outside the remainder.
    expect(trimHunk(old, whole(old, "ac\r\n"))).toEqual({ from: 1, to: 2, text: "c" });
    // Old "a\r\n" to "a\n": the shared "\n" would split the old pair, so it stays in the remainder.
    expect(trimHunk("a\r\n", whole("a\r\n", "a\n"))).toEqual({ from: 1, to: 3, text: "\n" });
    expect(trimHunk("a\n", whole("a\n", "a\r\n"))).toEqual({ from: 1, to: 2, text: "\r\n" });
  });

  it("does not split a surrogate pair in the prefix", () => {
    const old = "a\u{1F600}\n"; // high D83D, low DE00
    expect(trimHunk(old, whole(old, "a\u{1F601}\n"))).toEqual({
      from: 1,
      to: 3,
      text: "\u{1F601}",
    });
  });

  it("does not split a surrogate pair in the suffix", () => {
    const old = "a\u{1F600}\n";
    expect(trimHunk(old, whole(old, "a\u{1F680}\n"))).toEqual({
      from: 1,
      to: 3,
      text: "\u{1F680}",
    });
    expect(trimHunk("x\n", whole("x\n", "x\u{1F600}\n"))).toEqual({
      from: 1,
      to: 1,
      text: "\u{1F600}",
    });
  });

  it("returns null when old and new text are equal", () => {
    expect(trimHunk("same\n", whole("same\n", "same\n"))).toBeNull();
  });

  it("returns a delete-only remainder with empty text", () => {
    expect(trimHunk("abc\n", whole("abc\n", "ac\n"))).toEqual({ from: 1, to: 2, text: "" });
  });
});
