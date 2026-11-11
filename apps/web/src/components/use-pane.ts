import type { Document } from "@reveal-codes/engine";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { divergenceWords, mismatchAt } from "../client/divergence";
import { classifyKey } from "../editor/shortcuts";
import { statusText } from "../pane/layout";
import { initialPaneOpen, writePreference } from "../pane-preference";
import type { AppServices } from "../services";

export const SAVE_PROMPT = "Save document? Yes (No)";
export const SAVE_PROMPT_MS = 2000;

/** A modal dialog anywhere in the page suppresses Alt-F3 (Requirement 14.1). */
function modalIsOpen(): boolean {
  return document.querySelector('[aria-modal="true"]') !== null;
}

/**
 * Status text for the Pane: the F7 message wins; otherwise, while the head lies in a mismatched
 * quote, the position text plus the divergence words (Requirement 13.6). Null shows the position.
 */
export function composeStatus(doc: Document, cursor: number, f7: string | null): string | null {
  if (f7 !== null) return f7;
  const rec = mismatchAt(doc, cursor);
  if (rec === null || rec.result.status !== "mismatch") return null;
  const quoteText = doc.text.slice(rec.quote.start, rec.quote.end);
  const words = divergenceWords(quoteText, rec.result.prefixLength);
  return `${statusText(doc.text, cursor)}  Diverges at: ${words}`;
}

/** Position_Text: the position, plus the divergence words inside a mismatched quote. */
export function positionText(doc: Document, cursor: number): string {
  return composeStatus(doc, cursor, null) ?? statusText(doc.text, cursor);
}

export type PaneControl = Readonly<{
  open: boolean;
  toggle: () => void;
  saveMessage: string | null;
}>;

/** Open state: read the Pane_Preference once on mount, then write every change (Req 1.2 to 1.8). */
function usePanePreference(svc: AppServices): [boolean, Dispatch<SetStateAction<boolean>>] {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setOpen(initialPaneOpen(svc.storage));
    setReady(true);
    // Mount only: the preference is read once (Req 1.2 to 1.5).
  }, []);
  useEffect(() => {
    if (!ready) return;
    writePreference(svc.storage, open); // result ignored, no Notice (Req 1.8)
  }, [ready, open, svc]);
  return [open, setOpen];
}

/** Pane open state, the capturing Alt-F3 and F7 listener, and the F7 timer (Requirements 14.1 to 14.5). */
export function usePaneControl(svc: AppServices): PaneControl {
  const [open, setOpen] = usePanePreference(svc);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const openRef = useRef(open);
  openRef.current = open;
  const timer = useRef<unknown>(null);
  const stopTimer = useCallback(() => {
    if (timer.current !== null) svc.clearTimer(timer.current);
    timer.current = null;
  }, [svc]);
  const toggle = useCallback(() => {
    setOpen((o) => !o);
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const editorFocused = (document.activeElement?.closest('[role="textbox"]') ?? null) !== null;
      const ctx = { paneOpen: openRef.current, modalOpen: modalIsOpen(), editorFocused };
      const action = classifyKey(event, ctx);
      if (action === "togglePane") {
        event.preventDefault();
        setOpen((o) => !o);
      } else if (action === "saveStub") {
        event.preventDefault();
        stopTimer();
        setSaveMessage(SAVE_PROMPT);
        timer.current = svc.setTimer(() => {
          timer.current = null;
          setSaveMessage(null);
        }, SAVE_PROMPT_MS);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      stopTimer();
    };
  }, [svc, stopTimer]);
  return { open, toggle, saveMessage };
}
