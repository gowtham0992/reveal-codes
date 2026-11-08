"use client";

import type { Appendix, StatementBlock } from "@reveal-codes/export";
import { useEffect, useState } from "react";
import { AUTOSAVE_KEY } from "../persist";
import { printModel } from "../print-model";
import type { PrintModel, Thrown } from "../print-model";
import { defaultServices } from "../services";
import type { AppServices } from "../services";
import styles from "./print-view.module.css";

export type PrintViewProps = Readonly<{
  /** Only storage and the clock are read; tests inject them. */
  services?: Pick<AppServices, "storage" | "now">;
}>;

export const ABSENT_TEXT =
  "Nothing to print. Open the editor and resolve the blocking items first.";
export const UNREADABLE_TEXT = "The saved document could not be read.";

export function blockedText(count: number): string {
  return `This filing cannot be exported: ${String(count)} unresolved items remain.`;
}

function readStored(storage: AppServices["storage"]): string | null | Thrown {
  try {
    return storage.getItem(AUTOSAVE_KEY);
  } catch (thrown) {
    return { thrown };
  }
}

/** Title, numbered paragraph, table with a header row, or signature lines. */
export function StatementBlocks({ blocks }: Readonly<{ blocks: readonly StatementBlock[] }>) {
  return (
    <>
      {blocks.map((block, i) => (
        <StatementBlockView key={i} block={block} />
      ))}
    </>
  );
}

function StatementBlockView({ block }: Readonly<{ block: StatementBlock }>) {
  switch (block.kind) {
    case "title":
      return <p className={styles["title"]}>{block.text}</p>;
    case "paragraph":
      return (
        <p>
          {String(block.number)}. {block.text}
        </p>
      );
    case "signature":
      return (
        <div className={styles["signature"]}>
          <p>{block.line}</p>
          <p>{block.date}</p>
        </div>
      );
    case "table":
      return <BlockTable columns={block.columns} rows={block.rows} />;
  }
}

function BlockTable(props: { columns: readonly string[]; rows: readonly (readonly string[])[] }) {
  return (
    <table className={styles["table"]}>
      <thead>
        <tr>
          {props.columns.map((c, i) => (
            <th key={i}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {props.rows.map((row, r) => (
          <tr key={r}>
            {row.map((cell, c) => (
              <td key={c}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AppendixSection({ appendix }: Readonly<{ appendix: Appendix }>) {
  return (
    <section
      className={`${styles["section"] ?? ""} ${styles["mono"] ?? ""} ${styles["appendix"] ?? ""}`}
    >
      <p className={styles["title"]}>{appendix.title}</p>
      <p>{appendix.intro[0]}</p>
      <p>{appendix.intro[1]}</p>
      <pre className={styles["appendixLines"]}>{appendix.lines.join("\n")}</pre>
    </section>
  );
}

type Ready = Extract<PrintModel, { kind: "ready" }>;

function ReadyView({ model }: Readonly<{ model: Ready }>) {
  const serif = `${styles["section"] ?? ""} ${styles["serif"] ?? ""}`;
  return (
    <>
      <div className={styles["controls"]}>
        <button
          type="button"
          onClick={() => {
            window.print();
          }}
        >
          Print
        </button>
      </div>
      <section className={serif}>
        {model.paragraphs.map((text, i) => (
          <p key={i}>{text === "" ? "\u00a0" : text}</p>
        ))}
      </section>
      <section className={`${serif} ${styles["statement"] ?? ""}`}>
        <StatementBlocks blocks={model.blocks} />
      </section>
      <AppendixSection appendix={model.appendix} />
    </>
  );
}

function ModelView({ model }: Readonly<{ model: PrintModel }>) {
  switch (model.kind) {
    case "absent":
      return <p className={styles["message"]}>{ABSENT_TEXT}</p>;
    case "unreadable":
      return <p className={styles["message"]}>{UNREADABLE_TEXT}</p>;
    case "blocked":
      return (
        <>
          <p className={styles["message"]}>{blockedText(model.blocking.length)}</p>
          <ul className={styles["list"]}>
            {model.blocking.map((item, i) => (
              <li key={i} className={styles["item"]}>
                <span className={styles["code"]}>{item.code}</span> {item.text}
              </li>
            ))}
          </ul>
        </>
      );
    case "ready":
      return <ReadyView model={model} />;
  }
}

/** Reads storage after mount, never during server rendering (Req 8.1). */
export function PrintView({ services }: PrintViewProps) {
  const [model, setModel] = useState<PrintModel | null>(null);
  useEffect(() => {
    const svc = services ?? defaultServices();
    setModel(printModel(readStored(svc.storage), svc.now()));
  }, [services]);
  return (
    <main className={styles["page"]}>{model === null ? null : <ModelView model={model} />}</main>
  );
}
