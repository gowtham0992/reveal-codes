"use client";

import { ORDERS, selectableOrders } from "@reveal-codes/export";
import type { OrderEntry } from "@reveal-codes/export";
import { useId } from "react";
import { NO_ORDER_LABEL, curlyQuoted, optionText, summaryLine } from "../order-copy";
import type { OrderSelection } from "../order-selection";
import styles from "./order-picker.module.css";

export type OrderPickerProps = Readonly<{
  selection: OrderSelection;
  onSelect: (selection: OrderSelection) => void;
}>;

const GROUPS = selectableOrders(ORDERS);

/** The Picker (Requirement 3): a labelled native select over the selectable orders. */
export function OrderPicker({ selection, onSelect }: OrderPickerProps) {
  const id = useId();
  return (
    <div className={styles["field"]}>
      <label htmlFor={id} className={`small-label ${styles["label"] ?? ""}`}>
        Court or judge
      </label>
      <select
        id={id}
        className={styles["select"]}
        value={selection === null ? "" : selection.entryId}
        onChange={(event) => {
          const value = event.currentTarget.value;
          onSelect(value === "" ? null : { entryId: value });
        }}
      >
        <option value="">{NO_ORDER_LABEL}</option>
        {GROUPS.map((group) => (
          <optgroup key={group.court} label={group.court}>
            {group.entries.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {optionText(entry)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

export type OrderSummaryProps = Readonly<{
  entry: OrderEntry | null;
  /** Wraps the key language; real quotation marks by default, the print view passes `quoted`. */
  quote?: ((text: string) => string) | undefined;
}>;

/** The Order_Summary: nothing without an entry. */
export function OrderSummary({ entry, quote = curlyQuoted }: OrderSummaryProps) {
  if (entry === null) return null;
  return (
    <div className={styles["summary"]}>
      <p className={styles["summaryLine"]}>{summaryLine(entry)}</p>
      <p className={styles["keyLanguage"]}>{quote(entry.key_language)}</p>
      <a href={entry.source_url} target="_blank" rel="noreferrer">
        Source
      </a>
    </div>
  );
}
