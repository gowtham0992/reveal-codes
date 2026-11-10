import type { OrderElement } from "./orders-types.js";
import type { Statement, StatementOrder } from "./types.js";
import {
  ALL_DRAFTERS_SUFFIX,
  CONFIDENTIALITY_SENTENCE,
  NO_PROGRAM_SENTENCE,
  SIGNATURE_LINE,
  citingSentence,
  howUsedSentence,
  portionsSentence,
  promptRecordsSentence,
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

function toolSentences(s: Statement, has: (e: OrderElement) => boolean): string[] {
  if (!has("tool_name")) return [];
  return [s.aiUsed ? toolsSentence(s.tools) : NO_PROGRAM_SENTENCE];
}

function usageSentences(s: Statement, has: (e: OrderElement) => boolean): string[] {
  if (!s.aiUsed) return [];
  const out: string[] = [];
  if (has("portions") && s.aiPassages.length > 0) out.push(portionsSentence(s.aiPassages));
  if (has("how_used")) out.push(howUsedSentence(s.runCount));
  if (has("confidentiality") && s.confidentialityCertified) out.push(CONFIDENTIALITY_SENTENCE);
  if (has("prompt_records")) out.push(promptRecordsSentence(s.runCount));
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
