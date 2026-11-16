import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyBodyEdit, arbBodyEdit, arbParagraphs, runs } from "./arbitraries.js";

// XML 1.0 cannot carry C0 controls other than tab, LF, CR, nor U+FFFE, U+FFFF, nor lone surrogates.
function xmlUnsafe(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) return true;
    if (c === 0xfffe || c === 0xffff) return true;
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) i++;
      else return true;
    } else if (c >= 0xdc00 && c <= 0xdfff) return true;
  }
  return false;
}

describe("arbParagraphs and arbBodyEdit self-test", () => {
  it("arbParagraphs holds no newline and no XML-unsafe character", () => {
    fc.assert(
      fc.property(arbParagraphs, (ps) => ps.every((p) => !p.includes("\n") && !xmlUnsafe(p))),
      { numRuns: runs() },
    );
  });

  it("arbParagraphs reaches empty paragraphs, edge spaces, tabs, markup characters and non-ASCII", () => {
    const sample = fc.sample(arbParagraphs, { numRuns: 500, seed: 1 }).flat();
    expect(sample.some((p) => p === "")).toBe(true);
    expect(sample.some((p) => /^ | $/.test(p))).toBe(true);
    expect(sample.some((p) => p.includes("\t"))).toBe(true);
    expect(sample.some((p) => /["&<>]/.test(p))).toBe(true);
    expect(sample.some((p) => p.split("").some((ch) => ch.charCodeAt(0) > 0x7f))).toBe(true);
  });

  it("arbBodyEdit changes exactly one paragraph by exactly one character", () => {
    fc.assert(
      fc.property(
        arbParagraphs.chain((ps) => arbBodyEdit(ps).map((edit) => ({ ps, edit }))),
        ({ ps, edit }) => {
          const out = applyBodyEdit(ps, edit);
          const changed = out.flatMap((p, i) => (p !== ps[i] ? [i] : []));
          if (changed.length !== 1 || changed[0] !== edit.paragraph) return false;
          const before = Array.from(ps[edit.paragraph] ?? "");
          const after = Array.from(out[edit.paragraph] ?? "");
          const delta = after.length - before.length;
          return edit.kind === "insert"
            ? delta === 1
            : edit.kind === "delete"
              ? delta === -1
              : delta === 0;
        },
      ),
      { numRuns: runs() },
    );
  });
});
