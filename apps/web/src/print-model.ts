import { blockingIssues } from "@reveal-codes/engine";
import type { Declaration, DeclarationSubject, Document } from "@reveal-codes/engine";
import {
  applicableDeclaration,
  buildAppendix,
  buildStatement,
  canExport,
  declarationRequired,
  declarationSubject,
  firstPageHeading,
  needsConfidentiality,
  prohibitionNotice,
  renderStatement,
} from "@reveal-codes/export";
import type {
  Appendix,
  FirstPageHeading,
  OrderEntry,
  ProhibitionNotice,
  RunInfo,
  Statement,
  StatementBlock,
} from "@reveal-codes/export";
import { deserialise } from "./persist";

/** A failed storage read, passed as a value. */
export type Thrown = Readonly<{ thrown: unknown }>;

export type BlockedItem = Readonly<{ code: string; text: string }>;

export type PrintModel =
  | Readonly<{ kind: "absent" }>
  | Readonly<{ kind: "unreadable" }>
  | Readonly<{ kind: "blocked"; blocking: readonly BlockedItem[] }>
  | Readonly<{
      kind: "prohibited";
      blocking: readonly BlockedItem[];
      notice: ProhibitionNotice;
    }>
  | Readonly<{ kind: "declaration_pending"; subject: DeclarationSubject }>
  | Readonly<{
      kind: "ready";
      paragraphs: readonly string[];
      blocks: readonly StatementBlock[];
      heading: FirstPageHeading | null;
      certifiedBlocks: readonly StatementBlock[] | null;
      appendix: Appendix;
    }>;

function blockedItems(document: Document): readonly BlockedItem[] {
  return blockingIssues(document).map((issue) => ({
    code: issue.code,
    text: document.text.slice(issue.start, issue.end),
  }));
}

type Built = Readonly<{ statement: Statement; blocks: readonly StatementBlock[] }>;

function build(
  document: Document,
  runLog: readonly RunInfo[],
  meta: Readonly<{ now: Date; verifiedAt: string | null }>,
  order: OrderEntry | null,
  confidentialityCertified: boolean,
  declaration: Declaration | null,
): Built | null {
  const context = order === null ? null : { entry: order, confidentialityCertified };
  const statement = buildStatement(document, runLog, meta, context, declaration);
  if (!statement.ok) return null;
  return { statement: statement.value, blocks: renderStatement(statement.value) };
}

/**
 * Maps the stored value and the selected order to what the Print_View shows.
 * Pure and total: every fault is a value, never a throw (Req 8.1, 8.6 to 8.8).
 */
export function printModel(
  raw: string | null | Thrown,
  now: Date,
  order: OrderEntry | null,
): PrintModel {
  if (raw !== null && typeof raw === "object") return { kind: "unreadable" };
  const restored = deserialise(raw);
  if (!restored.ok) {
    return restored.error.kind === "absent" ? { kind: "absent" } : { kind: "unreadable" };
  }
  const { document, runLog, verifiedAt, declaration } = restored.value;
  if (!canExport(document, order, declaration)) {
    const blocking = blockedItems(document);
    const notice = prohibitionNotice(document, order, declaration);
    return notice === null
      ? { kind: "blocked", blocking }
      : { kind: "prohibited", blocking, notice };
  }
  if (declarationRequired(document, order, declaration)) {
    const subject = declarationSubject(document, order);
    if (subject !== "none") return { kind: "declaration_pending", subject };
  }
  const meta = { now, verifiedAt };
  const primary = build(document, runLog, meta, order, false, declaration);
  if (primary === null) return { kind: "unreadable" };
  const certified = needsConfidentiality(document, order, declaration)
    ? build(document, runLog, meta, order, true, declaration)
    : null;
  return {
    kind: "ready",
    paragraphs: document.text.split("\n"),
    blocks: primary.blocks,
    heading: firstPageHeading(primary.statement),
    certifiedBlocks: certified === null ? null : certified.blocks,
    appendix: buildAppendix(document, applicableDeclaration(document, order, declaration)),
  };
}
