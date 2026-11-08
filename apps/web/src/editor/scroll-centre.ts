import type { EditorView } from "@tiptap/pm/view";

const pending = new WeakMap<EditorView, number>();

/** Nearest ancestor that scrolls vertically, or null when layout says there is none (jsdom). */
export function scrollContainerOf(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node !== null; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if (overflow === "auto" || overflow === "scroll") return node;
  }
  return null;
}

/** The scrollTop that puts a line centred at `lineMid` (viewport y) in the middle of `box`, clamped. */
export function centredScrollTop(box: HTMLElement, lineMid: number): number {
  const rect = box.getBoundingClientRect();
  const wanted = box.scrollTop + (lineMid - (rect.top + box.clientHeight / 2));
  const max = Math.max(0, box.scrollHeight - box.clientHeight);
  return Math.min(max, Math.max(0, wanted));
}

/** The painted caret rect (the DOM selection), else ProseMirror's estimate. At a soft wrap the two can differ by a line. */
function caretRect(view: EditorView): { top: number; bottom: number } {
  const sel = window.getSelection();
  const rect =
    sel !== null && sel.rangeCount > 0 ? sel.getRangeAt(0).getClientRects()[0] : undefined;
  if (rect !== undefined && rect.height > 0) return rect;
  return view.coordsAtPos(view.state.selection.head);
}

function centreNow(view: EditorView): void {
  const box = scrollContainerOf(view.dom);
  if (box === null || box.clientHeight === 0) return;
  const coords = caretRect(view);
  box.scrollTop = centredScrollTop(box, (coords.top + coords.bottom) / 2);
}

/**
 * Scroll the selection line to the vertical centre of the editor's scroll container.
 * Runs in the next animation frame, after focus and layout; a newer request replaces an older one.
 */
export function requestCentre(view: EditorView): void {
  if (typeof requestAnimationFrame !== "function") return;
  const previous = pending.get(view);
  if (previous !== undefined) cancelAnimationFrame(previous);
  pending.set(
    view,
    requestAnimationFrame(() => {
      pending.delete(view);
      if (!view.isDestroyed) centreNow(view);
    }),
  );
}
