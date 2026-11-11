"use client";

import { useState } from "react";
import type { AssistantInfo } from "../client/api";
import type { AppServices } from "../services";
import type { Store } from "../store-runtime";
import styles from "./assistant-column.module.css";
import { AssistantPanel } from "./assistant-panel";
import { useAssistantRun } from "./use-assistant";

export type AssistantColumnProps = Readonly<{
  svc: AppServices;
  store: Store;
  info: AssistantInfo;
  getCaret: () => number;
  position: string;
  open: boolean;
  onToggle: () => void;
}>;

/** The left column: an "Assistant" disclosure button at the edge, the panel when expanded. */
export function AssistantColumn({
  svc,
  store,
  info,
  getCaret,
  position,
  open,
  onToggle,
}: AssistantColumnProps) {
  const run = useAssistantRun({ svc, store, info, getCaret });
  return (
    <div
      className={open ? styles["column"] : `${styles["column"] ?? ""} ${styles["closed"] ?? ""}`}
    >
      <button type="button" aria-expanded={open} onClick={onToggle}>
        Assistant
      </button>
      {open ? <AssistantPanel info={info} run={run} position={position} /> : null}
    </div>
  );
}

type SlotArgs = Readonly<{
  svc: AppServices;
  store: Store;
  info: AssistantInfo | null;
  getCaret: () => number;
  position: string;
}>;

/** The column element and the `data-assistant` value for the grid; both absent without an assistant. */
export function useAssistantSlot({ svc, store, info, getCaret, position }: SlotArgs) {
  const [open, setOpen] = useState(false); // collapsed on first load (Requirement 10.8)
  const toggle = (): void => {
    setOpen((v) => !v);
  };
  if (info === null) return { attr: undefined, node: null };
  const node = (
    <AssistantColumn
      svc={svc}
      store={store}
      info={info}
      getCaret={getCaret}
      position={position}
      open={open}
      onToggle={toggle}
    />
  );
  return { attr: open ? "open" : "closed", node };
}
