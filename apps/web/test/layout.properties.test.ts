import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { render } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import { itemIndexAtOffset, layoutPane, offsetOfItem } from "../src/pane/layout";
import type { PaneItem } from "../src/pane/layout";
import { arbLayoutDocument } from "./arbitraries";
import { runs } from "./support/fc";

/** Offset of the first code unit of each code point of `text`. */
function codePointOffsets(text: string): readonly number[] {
  const out: number[] = [];
  let at = 0;
  for (const cp of text) {
    out.push(at);
    at += cp.length;
  }
  return out;
}

function checkLayout(doc: Document): void {
  const r = render(doc, "display");
  const layout = layoutPane(doc);
  const items = layout.items;
  expect(items.map((i) => i.text).join("")).toBe(r.text);

  const codes = items.filter((i) => i.kind === "code");
  expect(codes.map((i) => ({ offset: i.offset, text: i.text }))).toEqual(
    r.positions.map((p) => ({ offset: p.offset, text: p.code })),
  );

  const texts = items.filter((i) => i.kind === "text");
  expect(texts.map((i) => i.offset)).toEqual(codePointOffsets(doc.text));

  const indexOf = (item: PaneItem): number => items.indexOf(item);
  const textAt = new Map(texts.map((t) => [t.offset, indexOf(t)]));
  const lastText = texts.length === 0 ? -1 : indexOf(texts[texts.length - 1] as PaneItem);
  for (const code of codes) {
    const target = textAt.get(code.offset);
    if (code.offset === doc.text.length) expect(indexOf(code)).toBeGreaterThan(lastText);
    else expect(indexOf(code)).toBeLessThan(target ?? -1);
  }

  texts.forEach((t) => {
    const k = indexOf(t);
    expect(itemIndexAtOffset(layout, t.offset)).toBe(k);
    expect(offsetOfItem(layout, k)).toBe(t.offset);
  });
  expect(itemIndexAtOffset(layout, doc.text.length)).toBe(lastText + 1);
}

describe("Property 4: pane layout _Requirements: 11.1, 11.2, 11.3, 11.4, 11.6, 11.8_", () => {
  // Property 4
  // Feature: editor-app, Property 4: Pane layout is faithful
  it("the items rebuild the display rendering and carry its offsets", () => {
    fc.assert(fc.property(arbLayoutDocument, checkLayout), { numRuns: runs() });
  });
});
