import { describe, expect, it } from "vitest";
import { classifyKey } from "../src/editor/shortcuts";
import type { KeyContext, KeyLike } from "../src/editor/shortcuts";

const open: KeyContext = { paneOpen: true, modalOpen: false, editorFocused: true };
const closed: KeyContext = { paneOpen: false, modalOpen: false, editorFocused: true };

function key(k: string, mods: Partial<Omit<KeyLike, "key">> = {}): KeyLike {
  return { key: k, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...mods };
}

describe("classifyKey", () => {
  it("maps the documented shortcuts", () => {
    const table: readonly (readonly [KeyLike, KeyContext, string | null])[] = [
      [key("F3", { altKey: true }), closed, "togglePane"],
      [key("F3", { altKey: true }), open, "togglePane"],
      [key("F7"), open, "saveStub"],
      [key("z", { ctrlKey: true }), open, "undo"],
      [key("z", { metaKey: true }), closed, "undo"],
      [key("Z", { metaKey: true, shiftKey: true }), closed, "redo"],
      [key("z", { ctrlKey: true, shiftKey: true }), closed, "redo"],
    ];
    for (const [e, ctx, expected] of table) expect(classifyKey(e, ctx)).toBe(expected);
  });

  it("returns null for keys that must fall through", () => {
    const table: readonly (readonly [KeyLike, KeyContext])[] = [
      [key("F3"), open],
      [key("F3", { altKey: true, ctrlKey: true }), open],
      [key("F3", { altKey: true, metaKey: true }), open],
      [key("F3", { altKey: true }), { ...open, modalOpen: true }],
      [key("F7"), closed],
      [key("F7", { ctrlKey: true }), open],
      [key("F7", { metaKey: true }), open],
      [key("F7", { altKey: true }), open],
      [key("z"), open],
      [key("z", { ctrlKey: true, altKey: true }), open],
      [key("z", { ctrlKey: true }), { ...open, editorFocused: false }],
      [key("y", { ctrlKey: true }), open],
      [key("a"), open],
      [key("Enter"), open],
      [key("F4", { altKey: true }), open],
    ];
    for (const [e, ctx] of table) expect(classifyKey(e, ctx)).toBeNull();
  });
});
