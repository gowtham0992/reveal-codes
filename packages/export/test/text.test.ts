import { createDocument } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { captionOf, clip, ellipsize } from "../src/text.js";

function doc(text: string): Document {
  const r = createDocument(text, "2026-01-01T00:00:00.000Z");
  if (!r.ok) throw new Error("fixture");
  return r.value;
}

describe("ellipsize", () => {
  it("keeps text of 79 and 80 characters whole", () => {
    expect(ellipsize("a".repeat(79), 80)).toBe("a".repeat(79));
    expect(ellipsize("a".repeat(80), 80)).toBe("a".repeat(80));
  });

  it("gives 79 characters and an ellipsis at 81", () => {
    const out = ellipsize("a".repeat(81), 80);
    expect(out).toBe(`${"a".repeat(79)}…`);
    expect(out.length).toBe(80);
  });

  it("backs off one unit when an astral character sits at the cut", () => {
    const text = `${"a".repeat(78)}😀tail`;
    expect(ellipsize(text, 80)).toBe(`${"a".repeat(78)}…`);
  });
});

describe("clip", () => {
  it("cuts plain text at the limit", () => {
    expect(clip("abcdef", 3)).toBe("abc");
    expect(clip("abc", 3)).toBe("abc");
  });

  it("does not split a surrogate pair", () => {
    expect(clip("ab😀", 3)).toBe("ab");
    expect(clip("ab😀", 4)).toBe("ab😀");
  });
});

describe("captionOf", () => {
  it("skips leading blank lines and trims", () => {
    expect(captionOf(doc("\n  \n  Motion to Dismiss  \nbody"))).toBe("Motion to Dismiss");
  });

  it("is empty when every line is blank", () => {
    expect(captionOf(doc(" \n\n  "))).toBe("");
    expect(captionOf(doc(""))).toBe("");
  });

  it("cuts to 120 characters", () => {
    expect(captionOf(doc("x".repeat(121)))).toBe("x".repeat(120));
  });

  it("backs off an astral character at 120", () => {
    expect(captionOf(doc(`${"x".repeat(119)}😀y`))).toBe("x".repeat(119));
  });
});
