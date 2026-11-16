"use client";
import type { Declaration } from "@reveal-codes/engine";
import { ConfidentialityCheckbox } from "./confidentiality-checkbox";
import { DeclarationControls } from "./declaration-controls";
import styles from "./export-order.module.css";
import { OrderPicker, OrderSummary } from "./order-picker";
import type { OrderGate } from "./use-order-gate";
export type ExportOrderProps = Readonly<{
  gate: OrderGate;
  /** Writes the stored Declaration; stays on the machine. */
  onDeclare: (declaration: Declaration | null) => void;
}>;
/**
 * The order block of the Export_Dialog, in this order: Picker, Order_Summary, prohibition
 * line (no override control), declaration controls, Confidentiality_Checkbox.
 */
export function ExportOrder({ gate, onDeclare }: ExportOrderProps) {
  const { subject } = gate;
  return (
    <div className={styles["order"]}>
      <OrderPicker selection={gate.selection} onSelect={gate.select} />
      <OrderSummary entry={gate.entry} />
      {gate.notice === null ? null : (
        <div className={styles["prohibition"]}>
          <p className={styles["text"]}>{gate.notice.line}</p>
        </div>
      )}
      {subject === "none" ? null : (
        <DeclarationControls
          key={subject}
          subject={subject}
          applicable={gate.applicable}
          onDeclare={onDeclare}
        />
      )}
      {gate.needsTick ? (
        <ConfidentialityCheckbox checked={gate.ticked} onChange={gate.setTicked} />
      ) : null}
    </div>
  );
}
