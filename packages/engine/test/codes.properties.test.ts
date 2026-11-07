import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parse, render, strip, stripPositions } from "../src/codes";
import { escapeText } from "../src/codes/syntax";
import { structuralEqual } from "../src/equal";
import { arbAnyString, arbDocument } from "../src/testing/arbitraries";
import type { CodePosition, Document } from "../src/types";
import { runs } from "./support/fc";

describe("Property 36: Full Reveal Codes round trip _Requirements: 19.2, 19.3, 20.1, 20.2_", () => {
  it("parse(render(d, full)) is ok, equals d, and re-renders to the same text", () => {
    // Property 36
    fc.assert(
      fc.property(arbDocument, (d) => {
        const text = render(d, "full").text;
        const parsed = parse(text);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(structuralEqual(parsed.value, d)).toBe(true);
        expect(render(parsed.value, "full").text).toBe(text);
      }),
      runs(),
    );
  });
});

/** Positions are sorted by offset, and each code sits at its own place in `text`. */
function expectConsistent(d: Document, text: string, positions: readonly CodePosition[]): void {
  let emitted = 0;
  let previous = 0;
  for (const p of positions) {
    expect(p.offset).toBeGreaterThanOrEqual(previous);
    previous = p.offset;
    const at = escapeText(d.text.slice(0, p.offset)).length + emitted;
    expect(text.startsWith(p.code, at)).toBe(true);
    emitted += p.code.length;
  }
}

describe("Property 37: Display is the Strip projection of full _Requirements: 19.10, 19.11, 19.12, 19.13_", () => {
  it("display is strip of full, positions project, offsets are consistent, strip is total", () => {
    // Property 37
    fc.assert(
      fc.property(fc.tuple(arbDocument, arbAnyString), ([d, garbage]) => {
        const full = render(d, "full");
        const display = render(d, "display");
        expect(display.text).toBe(strip(full.text));
        expect(strip(display.text)).toBe(display.text);

        const projected = stripPositions(full.positions);
        expect(display.positions).toEqual(projected);
        expect(projected.length).toBe(
          full.positions.filter((p) => !p.code.startsWith("[DOC")).length,
        );

        expectConsistent(d, full.text, full.positions);
        expectConsistent(d, display.text, display.positions);

        expect(strip(garbage).length).toBeLessThanOrEqual(garbage.length);
      }),
      runs(),
    );
  });
});

/** Test-local: drop every `[`..`]` Code, treating `\x` pairs as text, then unescape `\[` `\]` `\\`. */
function removeCodesAndUnescape(rendered: string): string {
  let kept = "";
  let i = 0;
  while (i < rendered.length) {
    const c = rendered[i] as string;
    if (c === "\\" && i + 1 < rendered.length) {
      kept += rendered.slice(i, i + 2);
      i += 2;
    } else if (c === "[") {
      i += 1;
      while (i < rendered.length && rendered[i] !== "]") i += rendered[i] === "\\" ? 2 : 1;
      i += 1;
    } else {
      kept += c;
      i += 1;
    }
  }
  return kept.replace(/\\([[\]\\])/g, "$1");
}

describe("Property 38: Removing Codes and unescaping yields the Text _Requirements: 19.3, 19.5_", () => {
  it("removing every Code and unescaping gives d.text in both modes", () => {
    // Property 38
    fc.assert(
      fc.property(arbDocument, fc.constantFrom("full", "display"), (d, mode) => {
        expect(removeCodesAndUnescape(render(d, mode).text)).toBe(d.text);
      }),
      runs(),
    );
  });
});
