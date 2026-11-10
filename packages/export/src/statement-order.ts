import type { OrderContext } from "./orders-types.js";
import type { Statement, StatementOrder } from "./types.js";
import { STATEMENT_TITLE, headerPointer } from "./wording.js";

/** The Statement's copy of the chosen entry; null for no selection. Shares nothing mutable. */
export function orderOf(ctx: OrderContext): StatementOrder | null {
  if (ctx === null) return null;
  const e = ctx.entry;
  return {
    id: e.id,
    instrument: e.instrument,
    title: e.title,
    court: e.court.name,
    judge: e.judge === null ? null : e.judge.name,
    date: e.date,
    sourceUrl: e.source_url,
    kind: e.kind,
    caption: e.caption === null ? null : { placement: e.caption.placement, text: e.caption.text },
    elements: [...e.elements],
  };
}

/** The caption text for statement_title and separate_declaration placements, else the standard. */
export function statementTitle(statement: Statement): string {
  const caption = statement.order?.caption ?? null;
  if (caption === null || caption.placement === "first_page_heading") return STATEMENT_TITLE;
  return caption.text;
}

export type FirstPageHeading = Readonly<{ heading: string; pointer: string }>;

/** The DOCX first-page header, only for a first_page_heading caption when AI was used. */
export function firstPageHeading(statement: Statement): FirstPageHeading | null {
  const caption = statement.order?.caption ?? null;
  if (caption === null || caption.placement !== "first_page_heading" || !statement.aiUsed) {
    return null;
  }
  return { heading: caption.text, pointer: headerPointer(statementTitle(statement)) };
}
