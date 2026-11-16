"use client";
import { useEffect, useRef } from "react";
type DropHandlers = Readonly<{
  /** Exactly one file was dropped: the same function the Picker calls. */
  onFile: (file: File) => void;
  /** More than one file was dropped: refuse and open none. */
  onSeveral: () => void;
}>;
function carriesFiles(e: DragEvent): boolean {
  return e.dataTransfer?.types.includes("Files") === true;
}
/** What a drop with files does; a drag with no files is not handled here. */
export function handleFileDrop(e: DragEvent, h: DropHandlers): void {
  if (!carriesFiles(e)) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.type !== "drop") return;
  const files = e.dataTransfer?.files;
  const first = files?.[0];
  if (files === undefined || first === undefined) return;
  if (files.length === 1) h.onFile(first);
  else h.onSeveral();
}
/**
 * Capture-phase `dragover` and `drop` listeners on `document` that act only when the drag carries
 * files. They stop the event before ProseMirror sees it and the browser never navigates to the file.
 * A drag with no file is left to the existing drop behaviour. No overlay, outline or animation.
 */
export function useFileDrop(handlers: DropHandlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    const listener = (e: DragEvent): void => {
      handleFileDrop(e, ref.current);
    };
    document.addEventListener("dragover", listener, true);
    document.addEventListener("drop", listener, true);
    return () => {
      document.removeEventListener("dragover", listener, true);
      document.removeEventListener("drop", listener, true);
    };
  }, []);
}
