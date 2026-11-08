export type ShortcutAction = "togglePane" | "saveStub" | "undo" | "redo";

export type KeyContext = Readonly<{
  paneOpen: boolean;
  modalOpen: boolean;
  editorFocused: boolean;
}>;

export type KeyLike = Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey">;

/** Maps a key event to an app shortcut, or null (Requirements 8.1, 10.5, 14.1, 14.3, 14.5). */
export function classifyKey(e: KeyLike, ctx: KeyContext): ShortcutAction | null {
  const command = e.ctrlKey || e.metaKey;
  if (e.key === "F3") {
    return e.altKey && !command && !ctx.modalOpen ? "togglePane" : null;
  }
  if (e.key === "F7") {
    return ctx.paneOpen ? "saveStub" : null;
  }
  if ((e.key === "z" || e.key === "Z") && command && !e.altKey && ctx.editorFocused) {
    return e.shiftKey ? "redo" : "undo";
  }
  return null;
}
