/**
 * Stubs for the layout APIs jsdom does not implement and ProseMirror calls
 * (found by the jsdom smoke test of task 1.1). Import this file for its side
 * effect in a `// @vitest-environment jsdom` test, or call `installDomShims()`.
 */
function emptyRects(): DOMRectList {
  const rects: DOMRect[] = [];
  return Object.assign(rects, { item: (): DOMRect | null => null });
}

function zeroRect(): DOMRect {
  return new DOMRect(0, 0, 0, 0);
}

export function installDomShims(): void {
  if (typeof Range === "undefined") return;
  Range.prototype.getClientRects = emptyRects;
  Range.prototype.getBoundingClientRect = zeroRect;
  document.elementFromPoint = () => null;
  Element.prototype.scrollIntoView = () => undefined;
}

installDomShims();
