"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "./modal.module.css";

const FOCUSABLE =
  'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';

export type ModalProps = Readonly<{
  title: string;
  onClose: () => void;
  /** Control that opened the dialog; focus returns to it. Defaults to the focused element at open. */
  restoreFocus?: HTMLElement | null | undefined;
  children: ReactNode;
}>;

function focusablesIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
}

/** Moves focus to `[data-autofocus]`, else the first control, else the dialog itself. */
function focusInside(root: HTMLElement): void {
  const target =
    root.querySelector<HTMLElement>("[data-autofocus]") ?? focusablesIn(root)[0] ?? root;
  target.focus();
}

/** Keeps Tab and Shift-Tab inside `root` (Requirement 18.9). */
function trapTab(event: KeyboardEvent<HTMLElement>, root: HTMLElement): void {
  const items = focusablesIn(root);
  const first = items[0];
  const last = items[items.length - 1];
  event.preventDefault();
  if (first === undefined || last === undefined) return;
  const active = document.activeElement;
  const outside = active === null || !root.contains(active) || active === root;
  if (event.shiftKey) (outside || active === first ? last : prevOf(items, active)).focus();
  else (outside || active === last ? first : nextOf(items, active)).focus();
}

function nextOf(items: readonly HTMLElement[], active: Element | null): HTMLElement {
  const i = items.findIndex((el) => el === active);
  return items[i + 1] ?? items[0] ?? (active as HTMLElement);
}

function prevOf(items: readonly HTMLElement[], active: Element | null): HTMLElement {
  const i = items.findIndex((el) => el === active);
  return items[i - 1] ?? items[items.length - 1] ?? (active as HTMLElement);
}

function useFocusLifecycle(
  dialog: { current: HTMLElement | null },
  restoreFocus: HTMLElement | null | undefined,
): void {
  const [opener] = useState<Element | null>(() => document.activeElement);
  const target = useRef(restoreFocus ?? opener);
  target.current = restoreFocus ?? opener;
  useEffect(() => {
    if (dialog.current !== null) focusInside(dialog.current);
    return () => {
      const back = target.current;
      if (back instanceof HTMLElement && back.isConnected) back.focus();
    };
  }, [dialog]);
}

/** Right-aligned button row at the foot of a dialog. */
export function ModalActions({ children }: Readonly<{ children: ReactNode }>) {
  return <div className={styles["actions"]}>{children}</div>;
}

/** Hand-built modal dialog: focus trap, Escape closes, focus returns to the opener (Req 18.9). */
export function Modal({ title, onClose, restoreFocus, children }: ModalProps) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement | null>(null);
  useFocusLifecycle(dialog, restoreFocus);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === "Tab" && dialog.current !== null) {
      trapTab(event, dialog.current);
    }
  };
  return createPortal(
    <div className={styles["overlay"]}>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={styles["dialog"]}
        onKeyDown={onKeyDown}
      >
        <h2 id={titleId} className={styles["title"]}>
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}
