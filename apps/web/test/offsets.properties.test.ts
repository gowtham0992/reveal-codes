import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { docText, offsetToPos, posToOffset } from "../src/editor/offsets";
import { arbParagraphList, type ParagraphList } from "./arbitraries";
import { runs } from "./support/fc";

type Para = Readonly<{ startPos: number; startOffset: number; length: number }>;

/** Positions summed from node sizes of the tree; lengths from the generating lines. */
function paragraphsOf({ lines, doc }: ParagraphList): readonly Para[] {
  const out: Para[] = [];
  let pos = 0;
  let offset = 0;
  doc.forEach((child, _o, index) => {
    const length = lines[index]?.length ?? -1;
    out.push({ startPos: pos + 1, startOffset: offset, length });
    pos += child.nodeSize;
    offset += length + 1;
  });
  return out;
}

function checkDocText(list: ParagraphList): void {
  expect(docText(list.doc)).toBe(list.lines.join("\n"));
  expect(list.doc.childCount).toBe(list.lines.length);
}

/** posToOffset(offsetToPos(o)) === o for every Offset, at the expected Pos. */
function checkOffsetRoundTrip(list: ParagraphList): void {
  const paras = paragraphsOf(list);
  const total = list.lines.join("\n").length;
  for (let o = 0; o <= total; o++) {
    const pos = offsetToPos(list.doc, o);
    expect(pos).not.toBeNull();
    if (pos === null) continue;
    expect(posToOffset(list.doc, pos)).toBe(o);
    const owner = paras.filter((p) => o >= p.startOffset && o <= p.startOffset + p.length)[0];
    expect(owner).toBeDefined();
    if (owner !== undefined) expect(pos).toBe(owner.startPos + (o - owner.startOffset));
  }
}

/** offsetToPos(posToOffset(pos)) === pos for every in-paragraph Pos. */
function checkPosRoundTrip(list: ParagraphList): void {
  for (const p of paragraphsOf(list)) {
    for (let i = 0; i <= p.length; i++) {
      const pos = p.startPos + i;
      const offset = posToOffset(list.doc, pos);
      expect(offset).toBe(p.startOffset + i);
      if (offset !== null) expect(offsetToPos(list.doc, offset)).toBe(pos);
    }
  }
}

/** The newline Offset ends paragraph i and the next Offset starts paragraph i + 1. */
function checkNewlines(list: ParagraphList): void {
  const paras = paragraphsOf(list);
  paras.slice(0, -1).forEach((p, i) => {
    const next = paras[i + 1];
    const newlineOffset = p.startOffset + p.length;
    expect(offsetToPos(list.doc, newlineOffset)).toBe(p.startPos + p.length);
    expect(offsetToPos(list.doc, newlineOffset + 1)).toBe(next?.startPos);
  });
}

describe("Property 1: offset round trip _Requirements: 4.2, 4.3, 4.4, 4.6_", () => {
  // Property 1
  it("docText, Offset to Pos and back, Pos to Offset and back, and newline Offsets all agree", () => {
    fc.assert(
      fc.property(arbParagraphList, (list) => {
        checkDocText(list);
        checkOffsetRoundTrip(list);
        checkPosRoundTrip(list);
        checkNewlines(list);
      }),
      { numRuns: runs() },
    );
  });
});
