import type { DeclarationSubject } from "@reveal-codes/engine";
import {
  howUsedDeclared,
  portionsDeclared,
  programAsNamed,
  programWithAuthor,
  promptRecordsDeclared,
} from "./declaration-wording.js";
import type { OrderElement } from "./orders-types.js";
import type { Statement, StatementOrder } from "./types.js";
import {
  ALL_DRAFTERS_SUFFIX,
  CONFIDENTIALITY_SENTENCE,
  SIGNATURE_LINE,
  citingSentence,
  howUsedSentence,
  portionsSentence,
  promptRecordsSentence,
  toolText,
  toolsSentence,
} from "./wording.js";

/** Paragraph 1 of a Statement made under an order. */
export function citingParagraph(order: StatementOrder): string {
  const caption = order.caption;
  return citingSentence({
    court: order.court,
    title: order.title,
    instrument: order.instrument,
    judge: order.judge,
    date: order.date,
    sourceUrl: order.sourceUrl,
    declarationCaption:
      caption !== null && caption.placement === "separate_declaration" ? caption.text : null,
  });
}

function toolsText(s: Statement): string | null {
  return s.tools.length === 0 ? null : s.tools.map((t) => toolText(t, " ")).join("; ");
}

function toolSentences(s: Statement, has: (e: OrderElement) => boolean): string[] {
  if (!has("tool_name")) return [];
  if (!s.aiUsed) return [];
  const d = s.declaration;
  const named = d !== null && d.choice === "declared_ai" ? d.toolName : null;
  if (named === null) return [toolsSentence(s.tools)];
  return [s.assistantText ? programWithAuthor(toolsText(s), named) : programAsNamed(named)];
}

function assistantUsage(s: Statement, has: (e: OrderElement) => boolean): string[] {
  const out: string[] = [];
  if (has("portions") && s.aiPassages.length > 0) out.push(portionsSentence(s.aiPassages));
  if (has("how_used") && s.runCount > 0) out.push(howUsedSentence(s.runCount));
  return out;
}

function declaredUsage(subject: DeclarationSubject, has: (e: OrderElement) => boolean): string[] {
  const out: string[] = [];
  if (has("portions")) out.push(portionsDeclared(subject));
  if (has("how_used")) out.push(howUsedDeclared(subject));
  return out;
}

function usageSentences(s: Statement, has: (e: OrderElement) => boolean): string[] {
  const d = s.declaration;
  const declared = d !== null && d.choice === "declared_ai";
  const out: string[] = s.assistantText ? assistantUsage(s, has) : [];
  if (declared) out.push(...declaredUsage(d.subject, has));
  if (has("confidentiality") && s.aiUsed && s.confidentialityCertified) {
    out.push(CONFIDENTIALITY_SENTENCE);
  }
  if (has("prompt_records") && s.assistantText && s.runCount > 0) {
    out.push(promptRecordsSentence(s.runCount));
  }
  if (has("prompt_records") && declared) out.push(promptRecordsDeclared(d.subject));
  return out;
}

/** Sentences appended to the AI (or no-AI) paragraph, in the design's order; [] with no order. */
export function orderSentences(statement: Statement): readonly string[] {
  const order = statement.order;
  if (order === null) return [];
  const has = (e: OrderElement): boolean => order.elements.includes(e);
  return [...toolSentences(statement, has), ...usageSentences(statement, has)];
}

/** The signature line, widened when the order needs all drafters to sign. */
export function signatureLine(statement: Statement): string {
  const all = statement.order?.elements.includes("signed_by_all_drafters") ?? false;
  return all ? SIGNATURE_LINE + ALL_DRAFTERS_SUFFIX : SIGNATURE_LINE;
}
