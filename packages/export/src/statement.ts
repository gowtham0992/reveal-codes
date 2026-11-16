import { checkToolName, err, ok, segment } from "@reveal-codes/engine";
import type { Declaration, Document, EngineError, Result } from "@reveal-codes/engine";
import { aiPassages } from "./ai-paragraphs.js";
import {
  applicableDeclaration,
  declarationRequired,
  declarationSubject,
  holdsAssistantText,
  usedAi,
} from "./declaration.js";
import type { StatementError } from "./statement-error.js";
import {
  citationsOf,
  countCharacters,
  countSentences,
  overridesOf,
  quotesOf,
  toolsOf,
} from "./statement-parts.js";
import { needsConfidentiality } from "./order-rules.js";
import type { OrderContext } from "./orders-types.js";
import { orderOf } from "./statement-order.js";
import { captionOf } from "./text.js";
import { isInstant, localDate } from "./time.js";
import type { Meta, RunInfo, Statement } from "./types.js";

/**
 * Error kind used for a bad `meta`: the Engine's own `invalid_timestamp`, so the
 * export package needs no error union of its own.
 */
function invalidTimestamp(value: unknown): Result<never, EngineError> {
  return err({ kind: "invalid_timestamp", value });
}

function validMeta(meta: Meta): Result<null, EngineError> {
  if (!(meta.now instanceof Date) || Number.isNaN(meta.now.getTime())) {
    return invalidTimestamp(meta.now);
  }
  if (meta.verifiedAt !== null && !isInstant(meta.verifiedAt)) {
    return invalidTimestamp(meta.verifiedAt);
  }
  return ok(null);
}

/** The author's tick counts only when the order asks for it and AI was used. */
function certified(document: Document, ctx: OrderContext, stored: Declaration | null): boolean {
  return (
    ctx !== null &&
    ctx.confidentialityCertified &&
    needsConfidentiality(document, ctx.entry, stored)
  );
}

/** The Applicable_Declaration with its Tool_Name trimmed, or the fault of an invalid name. */
function trimmedDeclaration(
  applicable: Declaration | null,
): Result<Declaration | null, StatementError> {
  if (applicable === null || applicable.choice === "none") return ok(applicable);
  const name = checkToolName(applicable.toolName);
  if (!name.ok) return err({ kind: "invalid_tool_name", fault: name.error });
  return ok({ subject: applicable.subject, choice: "declared_ai", toolName: name.value });
}

/**
 * Builds the Statement data from the Document alone. Reads no clock: `meta` is
 * the only source of time. Does not apply the export gate.
 */
export function buildStatement(
  document: Document,
  runLog: readonly RunInfo[],
  meta: Meta,
  orderContext: OrderContext = null,
  stored: Declaration | null = null,
): Result<Statement, StatementError> {
  const checked = validMeta(meta);
  if (!checked.ok) return checked;
  const sentences = segment(document.text, document.spans);
  if (!sentences.ok) return sentences;
  const entry = orderContext === null ? null : orderContext.entry;
  if (declarationRequired(document, entry, stored)) {
    const subject = declarationSubject(document, entry);
    if (subject !== "none") return err({ kind: "declaration_required", subject });
  }
  const declared = trimmedDeclaration(applicableDeclaration(document, entry, stored));
  if (!declared.ok) return declared;
  return ok({
    order: orderOf(orderContext),
    aiPassages: aiPassages(document),
    runCount: runLog.length,
    confidentialityCertified: certified(document, orderContext, stored),
    aiUsed: usedAi(document, entry, stored),
    assistantText: holdsAssistantText(document),
    declaration: declared.value,
    tools: toolsOf(document, runLog),
    characters: countCharacters(document),
    sentences: countSentences(sentences.value),
    citations: citationsOf(document),
    quotes: quotesOf(document),
    overrides: overridesOf(document),
    generatedAt: meta.now.toISOString(),
    generatedDate: localDate(meta.now),
    verifiedAt: meta.verifiedAt,
    verifiedDate: meta.verifiedAt === null ? null : localDate(new Date(meta.verifiedAt)),
    caption: captionOf(document),
  });
}
