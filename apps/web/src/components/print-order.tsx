"use client";
import type { FirstPageHeading, OrderEntry } from "@reveal-codes/export";
import { quoted } from "../order-copy";
import type { PrintModel } from "../print-model";
import { ConfidentialityCheckbox } from "./confidentiality-checkbox";
import { OrderSummary } from "./order-picker";
import styles from "./print-view.module.css";

export type PrintHeaderProps = Readonly<{
  order: OrderEntry | null;
  /** True when the Print button is shown. */
  printable: boolean;
  /** True when the confidentiality checkbox is shown. */
  needsTick: boolean;
  ticked: boolean;
  onTick: (ticked: boolean) => void;
}>;

/** The controls block, hidden in print: Print button, Order_Summary and the checkbox. */
export function PrintHeader(props: PrintHeaderProps) {
  return (
    <div className={styles["controls"]}>
      {props.printable ? (
        <button
          type="button"
          onClick={() => {
            window.print();
          }}
        >
          Print
        </button>
      ) : null}
      <OrderSummary entry={props.order} quote={quoted} />
      {props.needsTick ? (
        <ConfidentialityCheckbox checked={props.ticked} onChange={props.onTick} />
      ) : null}
    </div>
  );
}

/** Two lines at the top of the first page, outside the controls block so they print. */
export function FirstPageBlock({ heading }: Readonly<{ heading: FirstPageHeading | null }>) {
  if (heading === null) return null;
  return (
    <section
      className={`${styles["section"] ?? ""} ${styles["serif"] ?? ""} ${styles["firstPage"] ?? ""}`}
    >
      <p className={styles["firstPageHeading"]}>{heading.heading}</p>
      <p>{heading.pointer}</p>
    </section>
  );
}

type Prohibited = Extract<PrintModel, { kind: "prohibited" }>;

/** The prohibition notice and the blocked list; the Statement_Text is not shown. */
export function ProhibitedView({ model }: Readonly<{ model: Prohibited }>) {
  return (
    <>
      <p className={styles["message"]}>{model.notice.line}</p>
      <p className={styles["message"]}>{quoted(model.notice.keyLanguage)}</p>
      <ul className={styles["list"]}>
        {model.blocking.map((item, i) => (
          <li key={i} className={styles["item"]}>
            <span className={styles["code"]}>{item.code}</span> {item.text}
          </li>
        ))}
      </ul>
    </>
  );
}
