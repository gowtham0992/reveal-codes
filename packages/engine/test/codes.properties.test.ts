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
  it("display text is strip of full text, and display text is a strip fixed point", () => {
    // Property 37
    fc.assert(
      fc.property(arbDocument, (d) => {
        const display = render(d, "display").text;
        expect(display).toBe(strip(render(d, "full").text));
        expect(strip(display)).toBe(display);
      }),
      runs(),
    );
  });

  it("display positions are stripPositions of full positions, with [DOC] dropped", () => {
    // Property 37
    fc.assert(
      fc.property(arbDocument, (d) => {
        const full = render(d, "full").positions;
        const projected = stripPositions(full);
        expect(render(d, "display").positions).toEqual(projected);
        expect(projected.length).toBe(full.filter((p) => !p.code.startsWith("[DOC")).length);
      }),
      runs(),
    );
  });

  it("positions are sorted and located consistently with each rendering text", () => {
    // Property 37
    fc.assert(
      fc.property(arbDocument, (d) => {
        for (const mode of ["full", "display"] as const) {
          const r = render(d, mode);
          expectConsistent(d, r.text, r.positions);
        }
      }),
      runs(),
    );
  });

  it("strip is total on arbitrary strings and never lengthens its input", () => {
    // Property 37
    fc.assert(
      fc.property(arbAnyString, (s) => {
        expect(strip(s).length).toBeLessThanOrEqual(s.length);
      }),
      runs(),
    );
  });
});
