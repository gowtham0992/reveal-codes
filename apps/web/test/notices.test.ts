import { describe, expect, it } from "vitest";
import { noticeForError, noticeForHistoryError } from "../src/notices";

describe("notices (Requirements 3.4, 8.8)", () => {
  it("names the error kind for a rejected edit", () => {
    expect(noticeForError({ kind: "out_of_range", field: "at", value: 9, length: 2 })).toBe(
      "Edit not applied: out_of_range.",
    );
  });

  it("uses the stale text for undo and redo", () => {
    const stale = { kind: "stale_inverse" } as const;
    expect(noticeForHistoryError(stale, "undo")).toBe(
      "Undo not applied: the document changed since this edit.",
    );
    expect(noticeForHistoryError(stale, "redo")).toBe(
      "Redo not applied: the document changed since this edit.",
    );
  });

  it("names the kind for other history errors", () => {
    expect(noticeForHistoryError({ kind: "inverted_range", from: 2, to: 1 }, "redo")).toBe(
      "Redo not applied: inverted_range.",
    );
  });
});
