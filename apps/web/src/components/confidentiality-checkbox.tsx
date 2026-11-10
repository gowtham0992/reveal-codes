"use client";

import { CONFIDENTIALITY_LABEL } from "../order-copy";
import styles from "./confidentiality-checkbox.module.css";

export type ConfidentialityCheckboxProps = Readonly<{
  checked: boolean;
  onChange: (checked: boolean) => void;
}>;

/** The Confidentiality_Checkbox (Requirement 6): a native checkbox inside its label. */
export function ConfidentialityCheckbox({ checked, onChange }: ConfidentialityCheckboxProps) {
  return (
    <label className={styles["label"]}>
      <input
        type="checkbox"
        className={styles["input"]}
        checked={checked}
        onChange={(event) => {
          onChange(event.currentTarget.checked);
        }}
      />
      {CONFIDENTIALITY_LABEL}
    </label>
  );
}
