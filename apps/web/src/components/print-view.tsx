"use client";

import type { DeclarationSubject } from "@reveal-codes/engine";
import { ORDERS, orderById, subjectPhrase } from "@reveal-codes/export";
import type { Appendix, OrderEntry, StatementBlock } from "@reveal-codes/export";
import { useEffect, useState } from "react";
import { CONFIDENTIALITY_REQUIRED } from "../order-copy";
import { createOrderSelectionStore } from "../order-selection";
import { AUTOSAVE_KEY } from "../persist";
import { printModel } from "../print-model";
import type { BlockedItem, PrintModel, Thrown } from "../print-model";
import { defaultServices } from "../services";
import type { AppServices } from "../services";
import { FirstPageBlock, PrintHeader, ProhibitedView } from "./print-order";
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

function FilingSection({ paragraphs }: Readonly<{ paragraphs: readonly string[] }>) {
  return (
    <section className={`${styles["section"] ?? ""} ${styles["serif"] ?? ""}`}>
      {paragraphs.map((text, i) => (
        <p key={i}>{text === "" ? "\u00a0" : text}</p>
      ))}
    </section>
  );
}

function StatementSection({ model, ticked }: Readonly<{ model: Ready; ticked: boolean }>) {
  const serif = `${styles["section"] ?? ""} ${styles["serif"] ?? ""} ${styles["statement"] ?? ""}`;
  const waiting = model.certifiedBlocks !== null && !ticked;
  const blocks = model.certifiedBlocks !== null && ticked ? model.certifiedBlocks : model.blocks;
  return (
    <section className={serif}>
      {waiting ? <p>{CONFIDENTIALITY_REQUIRED}</p> : <StatementBlocks blocks={blocks} />}
    </section>
  );
}

type ReadyProps = Readonly<{
  model: Ready;
  order: OrderEntry | null;
  ticked: boolean;
  onTick: (ticked: boolean) => void;
}>;

function ReadyView({ model, order, ticked, onTick }: ReadyProps) {
  return (
    <>
      <PrintHeader
        order={order}
        printable
        needsTick={model.certifiedBlocks !== null}
        ticked={ticked}
        onTick={onTick}
      />
      <FirstPageBlock heading={model.heading} />
      <FilingSection paragraphs={model.paragraphs} />
      <StatementSection model={model} ticked={ticked} />
      <AppendixSection appendix={model.appendix} />
    </>
  );
}

function BlockedView({ blocking }: Readonly<{ blocking: readonly BlockedItem[] }>) {
  return (
    <>
      <p className={styles["message"]}>{blockedText(blocking.length)}</p>
      <ul className={styles["list"]}>
        {blocking.map((item, i) => (
          <li key={i} className={styles["item"]}>
            <span className={styles["code"]}>{item.code}</span> {item.text}
          </li>
        ))}
      </ul>
    </>
  );
}

type ModelViewProps = Readonly<{
  model: PrintModel;
  order: OrderEntry | null;
  ticked: boolean;
  onTick: (ticked: boolean) => void;
}>;

function ModelView({ model, order, ticked, onTick }: ModelViewProps) {
  switch (model.kind) {
    case "absent":
      return <p className={styles["message"]}>{ABSENT_TEXT}</p>;
    case "unreadable":
      return <p className={styles["message"]}>{UNREADABLE_TEXT}</p>;
    case "blocked":
      return <BlockedView blocking={model.blocking} />;
    case "prohibited":
      return (
        <>
          <PrintHeader
            order={order}
            printable={false}
            needsTick={false}
            ticked={false}
            onTick={onTick}
          />
          <ProhibitedView model={model} />
        </>
      );
    case "declaration_pending":
      return <PendingView subject={model.subject} />;
    case "ready":
      return <ReadyView model={model} order={order} ticked={ticked} onTick={onTick} />;
  }
}

export function declarationPendingText(subject: DeclarationSubject): string {
  return `The statement is not shown until you state whether generative AI was used to prepare ${subjectPhrase(subject)}. Make that statement in the Export dialog.`;
}

function PendingView({ subject }: Readonly<{ subject: DeclarationSubject }>) {
  return (
    <div className={styles["pending"]}>
      <p className={styles["message"]}>{declarationPendingText(subject)}</p>
      <a href="/" className={styles["link"]}>
        Back to the editor
      </a>
    </div>
  );
}

type Loaded = Readonly<{ model: PrintModel; order: OrderEntry | null }>;

function load(svc: Pick<AppServices, "storage" | "now">): Loaded {
  const selection = createOrderSelectionStore(svc.storage, ORDERS).get();
  const order = selection === null ? null : orderById(ORDERS, selection.entryId);
  return { model: printModel(readStored(svc.storage), svc.now(), order), order };
}

/** Reads storage after mount, never during server rendering (Req 8.1). */
export function PrintView({ services }: PrintViewProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [ticked, setTicked] = useState(false);
  useEffect(() => {
    setLoaded(load(services ?? defaultServices()));
    setTicked(false);
  }, [services]);
  return (
    <main className={styles["page"]}>
      {loaded === null ? null : (
        <ModelView model={loaded.model} order={loaded.order} ticked={ticked} onTick={setTicked} />
      )}
    </main>
  );
}
