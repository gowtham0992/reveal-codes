import { blockingIssues } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import { buildAppendix, buildStatement, canExport, renderStatement } from "@reveal-codes/export";
import type { Appendix, StatementBlock } from "@reveal-codes/export";
import { deserialise } from "./persist";

/** A failed storage read, passed as a value. */
export type Thrown = Readonly<{ thrown: unknown }>;

export type BlockedItem = Readonly<{ code: string; text: string }>;

export type PrintModel =
  | Readonly<{ kind: "absent" }>
  | Readonly<{ kind: "unreadable" }>
  | Readonly<{ kind: "blocked"; blocking: readonly BlockedItem[] }>
  | Readonly<{
      kind: "ready";
      paragraphs: readonly string[];
      blocks: readonly StatementBlock[];
      appendix: Appendix;
    }>;

function blockedItems(document: Document): readonly BlockedItem[] {
  return blockingIssues(document).map((issue) => ({
    code: issue.code,
    text: document.text.slice(issue.start, issue.end),
  }));
}

/**
 * Maps the stored value to what the Print_View shows. Pure and total: every
 * fault is a value, never a throw (Req 8.1, 8.6 to 8.8).
 */
export function printModel(raw: string | null | Thrown, now: Date): PrintModel {
  if (raw !== null && typeof raw === "object") return { kind: "unreadable" };
  const restored = deserialise(raw);
  if (!restored.ok) {
    return restored.error.kind === "absent" ? { kind: "absent" } : { kind: "unreadable" };
  }
  const { document, runLog, verifiedAt } = restored.value;
  if (!canExport(document)) return { kind: "blocked", blocking: blockedItems(document) };
  const statement = buildStatement(document, runLog, { now, verifiedAt });
  if (!statement.ok) return { kind: "unreadable" };
  return {
    kind: "ready",
    paragraphs: document.text.split("\n"),
    blocks: renderStatement(statement.value),
    appendix: buildAppendix(document),
  };
}
